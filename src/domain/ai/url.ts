// Base URL validation for "Conectar mi IA". PURE (no `URL`: React Native's polyfill does not
// implement `hostname`). HTTPS is required, except for a self-hosted server on this phone or the
// local network (Ollama, LM Studio, vLLM), where plain HTTP is allowed.

export type BaseUrlCheck =
  { ok: true; url: string } | { ok: false; reason: 'empty' | 'invalid' | 'httpsRequired' };

const URL_PATTERN = /^(https?):\/\/(\[[0-9a-fA-F:.]+\]|[^/?#:@\s]+)(?::(\d{1,5}))?(\/[^?#\s]*)?$/;

function ipv4Parts(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  return numbers.every((value) => value <= 255) ? numbers : null;
}

/** Loopback, private IPv4 ranges (RFC 1918), link-local, IPv6 loopback / ULA / link-local, `.local`. */
export function isLocalHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  const ip = ipv4Parts(host);
  if (ip) {
    const [a = -1, b = -1] = ip;
    return (
      a === 127 ||
      a === 10 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254)
    );
  }
  if (host.includes(':')) {
    return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
  }
  return false;
}

export function checkBaseUrl(raw: string): BaseUrlCheck {
  const text = raw.trim().replace(/\/+$/, '');
  if (text === '') return { ok: false, reason: 'empty' };
  const match = URL_PATTERN.exec(text);
  if (!match) return { ok: false, reason: 'invalid' };
  const [, scheme, host = '', port] = match;
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    return { ok: false, reason: 'invalid' };
  }
  if (host.startsWith('[') ? false : !/^[a-zA-Z0-9.-]+$/.test(host)) {
    return { ok: false, reason: 'invalid' };
  }
  if (scheme?.toLowerCase() === 'http' && !isLocalHost(host)) {
    return { ok: false, reason: 'httpsRequired' };
  }
  return { ok: true, url: text };
}
