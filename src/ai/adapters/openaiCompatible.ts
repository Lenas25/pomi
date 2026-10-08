// OpenAI Chat Completions (`POST {base}/chat/completions`, `Authorization: Bearer <key>`): OpenAI,
// Gemini's OpenAI-compatible endpoint, Moonshot Kimi, MiniMax, OpenRouter and self-hosted servers
// (Ollama, LM Studio, vLLM), whose key is optional.
import { isRecord, postJson, type AiAdapter } from './http';

export const openaiCompatibleChat: AiAdapter = async (endpoint, request, deps) => {
  const headers: Record<string, string> = {};
  if (endpoint.apiKey !== null) headers.authorization = `Bearer ${endpoint.apiKey}`;
  const body = {
    model: endpoint.model,
    messages: [{ role: 'system', content: request.system }, ...request.messages],
    [endpoint.maxTokensField]: endpoint.maxOutputTokens,
    stream: false,
  };
  const outcome = await postJson(`${endpoint.baseUrl}/chat/completions`, headers, body, deps);
  if (!outcome.ok) return outcome;
  const choices = isRecord(outcome.data) ? outcome.data.choices : undefined;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const message = isRecord(first) ? first.message : undefined;
  const content = isRecord(message) ? message.content : undefined;
  if (typeof content !== 'string') {
    return message !== undefined && content === null
      ? { ok: true, text: '' }
      : { ok: false, error: 'badResponse' };
  }
  return { ok: true, text: content.trim() };
};
