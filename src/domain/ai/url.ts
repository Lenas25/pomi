// Base URL validation for "Conectar mi IA". PURE (no `URL`: React Native's polyfill does not
// implement `hostname`). HTTPS is required, except for a self-hosted server on this phone or the
// private local network (Ollama, LM Studio, vLLM), where plain HTTP is allowed WITHOUT an API key:
// a key is only ever sent over https.

export type BaseUrlCheck =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' | 'invalid' | 'httpsRequired' | 'keyNeedsHttps' };

const URL_PATTERN = /^(https?):\/\/(\[[0-9a-fA-F:.]+\]|[^/?#:@\s]+)(?::(\d{1,5}))?(\/[^?#\s]*)?$/i;

type ParsedUrl = { text: string; scheme: 'http' | 'https'; host: string; port: number };

function ipv4Parts(host: string): number[] | null {
  const parts = host.split('.');
  // Leading zeros are rejected: some stacks read "010" as octal, turning a "private" host public.
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part))) return null;
  const numbers = parts.map(Number);
  return numbers.every((value) => value <= 255) ? numbers : null;
}

/**
 * Hosts trusted for plain http (never with a key): `localhost`, loopback 127/8, private IPv4
 * (RFC 1918), IPv6 loopback and ULA (fc00::/7). NOT trusted: link-local (169.254/16, fe80::/10),
 * `*.local` (mDNS, spoofable on any shared network) and `*.localhost` subdomains.
 */
export function isLocalHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost') return true;
  const ip = ipv4Parts(host);
  if (ip) {
    const [a = -1, b = -1] = ip;
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  }
  if (host.includes(':')) return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host);
  return false;
}

function parseUrl(raw: string): ParsedUrl | 'empty' | 'invalid' {
  const text = raw.trim().replace(/\/+$/, '');
  if (text === '') return 'empty';
  const match = URL_PATTERN.exec(text);
  if (!match) return 'invalid';
  const [, rawScheme = '', rawHost = '', port] = match;
  const scheme = rawScheme.toLowerCase() === 'https' ? 'https' : 'http';
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) return 'invalid';
  if (!rawHost.startsWith('[') && !/^[a-zA-Z0-9.-]+$/.test(rawHost)) return 'invalid';
  const host = rawHost.toLowerCase();
  return {
    text,
    scheme,
    host,
    port: port !== undefined ? Number(port) : scheme === 'https' ? 443 : 80,
  };
}

/**
 * `withKey`: an API key would travel with the requests, so plain http is refused even on the
 * local network (`keyNeedsHttps`).
 */
export function checkBaseUrl(raw: string, options: { withKey?: boolean } = {}): BaseUrlCheck {
  const parsed = parseUrl(raw);
  if (typeof parsed === 'string') return { ok: false, reason: parsed };
  if (parsed.scheme === 'http') {
    if (!isLocalHost(parsed.host)) return { ok: false, reason: 'httpsRequired' };
    if (options.withKey === true) return { ok: false, reason: 'keyNeedsHttps' };
  }
  return { ok: true, url: parsed.text };
}

/** Normalized origin (`scheme://host:port`, lowercase, explicit port), or `null` when invalid. */
export function originOf(raw: string): string | null {
  const parsed = parseUrl(raw);
  if (typeof parsed === 'string') return null;
  return `${parsed.scheme}://${parsed.host}:${parsed.port}`;
}
