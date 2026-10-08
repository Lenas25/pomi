// Anthropic Messages API (`POST {base}/v1/messages`, headers `x-api-key` and `anthropic-version`).
import { isRecord, postJson, type AiAdapter } from './http';

export const ANTHROPIC_VERSION = '2023-06-01';

export const anthropicChat: AiAdapter = async (endpoint, request, deps) => {
  const headers: Record<string, string> = { 'anthropic-version': ANTHROPIC_VERSION };
  if (endpoint.apiKey !== null) headers['x-api-key'] = endpoint.apiKey;
  const body = {
    model: endpoint.model,
    max_tokens: endpoint.maxOutputTokens,
    system: request.system,
    messages: request.messages,
  };
  const outcome = await postJson(`${endpoint.baseUrl}/v1/messages`, headers, body, deps);
  if (!outcome.ok) return outcome;
  const content = isRecord(outcome.data) ? outcome.data.content : undefined;
  if (!Array.isArray(content)) return { ok: false, error: 'badResponse' };
  const text = content
    .flatMap((block: unknown) =>
      isRecord(block) && block.type === 'text' && typeof block.text === 'string'
        ? [block.text]
        : [],
    )
    .join('')
    .trim();
  return { ok: true, text };
};
