import { env } from './env';

/** Best-effort client IP. Only trusts forwarded headers when TRUST_PROXY=1 (set on Vercel). */
export function clientIp(h: Headers): string {
  if (env().TRUST_PROXY) {
    const xff = h.get('x-forwarded-for');
    const first = xff?.split(',')[0]?.trim();
    if (first) return first;
    const real = h.get('x-real-ip');
    if (real) return real.trim();
  }
  return 'unknown';
}

export const userAgent = (h: Headers): string => (h.get('user-agent') ?? '').slice(0, 300);

/** Origins that may perform state-changing requests with cookies. */
export function allowedOrigins(): Set<string> {
  const e = env();
  return new Set([new URL(e.APP_ORIGIN).origin, ...e.ALLOWED_ORIGINS.map((o) => new URL(o).origin)]);
}

/** CSRF defence in depth on top of SameSite cookies: reject cross-site mutations. */
export function isTrustedOrigin(h: Headers): boolean {
  const origin = h.get('origin');
  if (origin) return allowedOrigins().has(origin);
  const referer = h.get('referer');
  if (referer) {
    try { return allowedOrigins().has(new URL(referer).origin); } catch { return false; }
  }
  return false;
}
