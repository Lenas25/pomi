// Glue of "Conectar mi IA": prompt words from i18n, the stored connection and one chat round.
import type { Repositories } from '../db/repositories';
import { appendHistory, type AiChatEntry } from '../domain/ai/history';
import type { AiPromptStrings, AiRequest } from '../domain/ai/prompt';
import { buildPingRequest } from '../domain/ai/prompt';
import { endpointOf, type AiConnection } from '../domain/ai/providers';
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
  const key = await deps.keyStore.read();
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
  const key = await deps.keyStore.read();
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
