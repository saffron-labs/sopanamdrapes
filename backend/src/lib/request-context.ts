import { env } from './env';

/** Best-effort client IP. Only trusts forwarded headers when TRUST_PROXY=1 (set on Vercel). */
export function clientIp(h: Headers): string {
  if (env().TRUST_PROXY) {
    // Headers set by the platform itself win. Otherwise take the RIGHT-most X-Forwarded-For entry: that is the address
    // our own proxy saw. The left-most entries are whatever the client chose to send, so they can be spoofed.
    for (const name of ['x-vercel-forwarded-for', 'x-real-ip']) {
      const v = h.get(name)?.split(',')[0]?.trim();
      if (v) return v.slice(0, 64);
    }
    const last = h.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
    if (last) return last.slice(0, 64);
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
