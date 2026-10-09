// Shared HTTP plumbing of the AI adapters: one POST with a hard timeout and a readable error code.
// No logging anywhere in this folder: requests carry the API key and personal aggregates.
// Redirects: `redirect: 'error'` asks fetch not to follow them, and any 3xx / followed redirect /
// response from another origin is refused. React Native's fetch (OkHttp on Android) may still follow
// a redirect natively before JS sees it, so the real guard is upstream: only https carries a key and
// a key is only read for the exact origin it was saved for (`src/ai/keyStore.ts`).
import { MAX_RESPONSE_CHARS } from '../../domain/ai/limits';
import { AI_TIMEOUT_MS, type AiEndpoint } from '../../domain/ai/providers';
import { originOf } from '../../domain/ai/url';
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
  | 'timeout'
  | 'redirected'
  | 'tooLarge'
  | 'unsafeUrl'
  | 'insecureKey';

export type AiResult =
  { ok: true; text: string } | { ok: false; error: AiErrorCode; status?: number };

/** The slice of a `fetch` response the adapters read. */
export type FetchResponseLike = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  /** Set by spec-compliant fetch implementations when a redirect was followed. */
  redirected?: boolean;
  /** Final URL after redirects (React Native fills it from the native response URL). */
  url?: string;
  headers?: { get: (name: string) => string | null };
};

/** The slice of `fetch` the adapters use (injectable for tests). */
export type FetchLike = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
    /** Never follow a redirect: the key and the data must only reach the configured host. */
    redirect: 'error';
  },
) => Promise<FetchResponseLike>;

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

/** A response that came from anywhere other than the URL we posted to (3xx, followed redirect). */
function wasRedirected(url: string, response: FetchResponseLike): boolean {
  if (response.status >= 300 && response.status < 400) return true;
  if (response.redirected === true) return true;
  const finalUrl = response.url;
  if (typeof finalUrl !== 'string' || finalUrl === '' || finalUrl === url) return false;
  const finalOrigin = originOf(finalUrl);
  return finalOrigin === null || finalOrigin !== originOf(url);
}

function declaredTooLarge(response: FetchResponseLike): boolean {
  const declared = Number(response.headers?.get('content-length') ?? '');
  return Number.isFinite(declared) && declared > MAX_RESPONSE_CHARS;
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
        redirect: 'error',
      }),
      timeout,
    ]);
    if (response === TIMED_OUT) return { ok: false, error: 'timeout' };
    if (wasRedirected(url, response)) {
      return { ok: false, error: 'redirected', status: response.status };
    }
    if (!response.ok)
      return { ok: false, error: errorForStatus(response.status), status: response.status };
    if (declaredTooLarge(response)) return { ok: false, error: 'tooLarge' };
    const text = await Promise.race([response.text(), timeout]);
    if (text === TIMED_OUT) return { ok: false, error: 'timeout' };
    if (text.length > MAX_RESPONSE_CHARS) return { ok: false, error: 'tooLarge' };
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: 'badResponse' };
    }
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
