// Glue of "Conectar mi IA": prompt words from i18n, the stored connection and one chat round.
import type { Repositories } from '../db/repositories';
import { appendHistory, type AiChatEntry } from '../domain/ai/history';
import type { AiPromptStrings, AiRequest } from '../domain/ai/prompt';
import { buildPingRequest } from '../domain/ai/prompt';
import {
  endpointOf,
  keyTargetOf,
  sameDestination,
  type AiConnection,
} from '../domain/ai/providers';
import { translateIn, type Language } from '../i18n';

import { sendChat, type AiResult, type FetchLike } from './adapters';
import type { AiKeyStore } from './keyStore';

const RULE_KEYS = [
  'role',
  'scope',
  'language',
  'noMedical',
  'prudent',
  'numbers',
  'changes',
  'tone',
  'brief',
  'offTopic',
  'untrusted',
] as const;

/** The system prompt lines and labels in one language. */
export function promptStringsFor(language: Language): AiPromptStrings {
  return {
    rules: RULE_KEYS.map((key) => translateIn(language, `ai.prompt.${key}`)),
    questionLabel: translateIn(language, 'ai.prompt.questionLabel'),
    dataLabel: translateIn(language, 'ai.prompt.dataLabel'),
  };
}

type Deps = { keyStore: AiKeyStore; fetch?: FetchLike; timeoutMs?: number };

/** "Probar conexión": a tiny request with no personal data. */
export async function testConnection(
  connection: AiConnection,
  language: Language,
  deps: Deps,
): Promise<AiResult> {
  const key = await deps.keyStore.read(keyTargetOf(connection));
  const strings = promptStringsFor(language);
  return sendChat(
    endpointOf(connection, key),
    buildPingRequest(strings, translateIn(language, 'ai.prompt.ping')),
    { requireKey: false, requireText: false, ...transport(deps) },
  );
}

function transport(deps: Deps) {
  return {
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
  };
}

/**
 * Sends the EXACT request the person reviewed and, on success, stores the question and the answer
 * in the on-device history. Nothing is written on failure.
 */
export async function askAndRecord(
  repos: Pick<Repositories, 'settings'>,
  connection: AiConnection,
  question: string,
  request: AiRequest,
  deps: Deps & { now?: () => number },
): Promise<AiResult> {
  const key = await deps.keyStore.read(keyTargetOf(connection));
  const result = await sendChat(endpointOf(connection, key), request, {
    requireKey: false,
    requireText: true,
    ...transport(deps),
  });
  if (!result.ok) return result;
  const at = (deps.now ?? Date.now)();
  const entries: AiChatEntry[] = [
    { role: 'user', text: question.trim(), at },
    { role: 'assistant', text: result.text, at },
  ];
  await repos.settings.update('aiChat', (current) => appendHistory(current, entries));
  return result;
}

/**
 * "Guardar": stores the connection and, when typed, the key bound to its provider and origin. A
 * changed destination (provider or base URL) deletes every stored key first, so the person must
 * type the key again for the new host.
 */
export async function saveConnection(
  repos: Pick<Repositories, 'settings'>,
  keyStore: AiKeyStore,
  previous: AiConnection | undefined,
  next: AiConnection,
  key: string | null,
): Promise<void> {
  if (!sameDestination(previous, next)) await keyStore.clear();
  if (key !== null) {
    const target = keyTargetOf(next);
    if (target === null) throw new Error('invalid base URL');
    await keyStore.save(target, key);
  }
  await repos.settings.set('aiConnection', next);
}

/** Turns the connection off and deletes the key from the secure store. History stays. */
export async function disconnect(
  repos: Pick<Repositories, 'settings'>,
  keyStore: AiKeyStore,
): Promise<void> {
  await keyStore.clear();
  const current = await repos.settings.get('aiConnection');
  if (current)
    await repos.settings.update('aiConnection', (stored) => ({
      ...(stored ?? current),
      enabled: false,
    }));
}
