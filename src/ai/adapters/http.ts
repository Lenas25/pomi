// Shared HTTP plumbing of the AI adapters: one POST with a hard timeout and a readable error code.
// No logging anywhere in this folder: requests carry the API key and personal aggregates.
import { AI_TIMEOUT_MS, type AiEndpoint } from '../../domain/ai/providers';
import type { AiRequest } from '../../domain/ai/prompt';

export type AiErrorCode =
  | 'noKey'
  | 'noModel'
  | 'unauthorized'
  | 'modelNotFound'
  | 'rateLimited'
  | 'badRequest'
  | 'server'
  | 'badResponse'
  | 'emptyAnswer'
  | 'network'
  | 'timeout';

export type AiResult =
  { ok: true; text: string } | { ok: false; error: AiErrorCode; status?: number };

/** The slice of `fetch` the adapters use (injectable for tests). */
export type FetchLike = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type AdapterDeps = { fetch?: FetchLike; timeoutMs?: number };

/** An adapter: same signature for every provider, so adding one never touches the rest. */
export type AiAdapter = (
  endpoint: AiEndpoint,
  request: AiRequest,
  deps?: AdapterDeps,
) => Promise<AiResult>;

export function errorForStatus(status: number): AiErrorCode {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'modelNotFound';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'server';
  if (status >= 400) return 'badRequest';
  return 'badResponse';
}

type PostOutcome = { ok: true; data: unknown } | { ok: false; error: AiErrorCode; status?: number };

const TIMED_OUT = Symbol('timeout');

export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  deps: AdapterDeps = {},
): Promise<PostOutcome> {
  const fetchFn: FetchLike = deps.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(TIMED_OUT);
    }, deps.timeoutMs ?? AI_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      timeout,
    ]);
    if (response === TIMED_OUT) return { ok: false, error: 'timeout' };
    if (!response.ok)
      return { ok: false, error: errorForStatus(response.status), status: response.status };
    const data = await Promise.race([response.json(), timeout]);
    if (data === TIMED_OUT) return { ok: false, error: 'timeout' };
    return { ok: true, data };
  } catch {
    if (controller.signal.aborted) return { ok: false, error: 'timeout' };
    // React Native's fetch rejects with a TypeError when offline or the host is unreachable.
    return { ok: false, error: 'network' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
