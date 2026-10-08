import type { AiEndpoint } from '../../domain/ai/providers';
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
 */
export async function sendChat(
  endpoint: AiEndpoint,
  request: AiRequest,
  options: AdapterDeps & { requireKey: boolean; requireText: boolean },
): Promise<AiResult> {
  if (options.requireKey && endpoint.apiKey === null) return { ok: false, error: 'noKey' };
  if (endpoint.model === '') return { ok: false, error: 'noModel' };
  const result = await ADAPTERS[endpoint.adapter](endpoint, request, options);
  if (result.ok && options.requireText && result.text === '') {
    return { ok: false, error: 'emptyAnswer' };
  }
  return result;
}
