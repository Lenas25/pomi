import { MAX_STORED_TEXT } from '../../domain/ai/history';
import type { AiEndpoint } from '../../domain/ai/providers';
import { checkBaseUrl } from '../../domain/ai/url';
import type { AiRequest } from '../../domain/ai/prompt';

import { anthropicChat } from './anthropic';
import type { AdapterDeps, AiAdapter, AiResult } from './http';
import { openaiCompatibleChat } from './openaiCompatible';

export type { AiErrorCode, AiResult, FetchLike } from './http';

const ADAPTERS: Record<AiEndpoint['adapter'], AiAdapter> = {
  openai: openaiCompatibleChat,
  anthropic: anthropicChat,
};

/**
 * One chat call through the endpoint's adapter. `requireText`: an empty answer is an error for a
 * chat, but fine for "Probar conexión" (the server answered, the key and model work).
 * The base URL is checked AGAIN here (a stored or restored setting may bypass the form): an invalid
 * or non-https remote URL is `unsafeUrl`, a key over plain http is `insecureKey`; nothing is sent.
 * The answer is capped at `MAX_STORED_TEXT` characters (the same cap as the stored history).
 */
export async function sendChat(
  endpoint: AiEndpoint,
  request: AiRequest,
  options: AdapterDeps & { requireKey: boolean; requireText: boolean },
): Promise<AiResult> {
  const url = checkBaseUrl(endpoint.baseUrl, { withKey: endpoint.apiKey !== null });
  if (!url.ok)
    return { ok: false, error: url.reason === 'keyNeedsHttps' ? 'insecureKey' : 'unsafeUrl' };
  if (options.requireKey && endpoint.apiKey === null) return { ok: false, error: 'noKey' };
  if (endpoint.model === '') return { ok: false, error: 'noModel' };
  const result = await ADAPTERS[endpoint.adapter](endpoint, request, options);
  if (!result.ok) return result;
  if (options.requireText && result.text === '') return { ok: false, error: 'emptyAnswer' };
  return { ok: true, text: result.text.slice(0, MAX_STORED_TEXT) };
}
