import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { db, type Db } from '@/db/client';
import { ApiError, unauthorized } from './errors';
import { enforceRateLimit } from './rate-limit';
import { clientIp, isTrustedOrigin, userAgent } from './request-context';
import { env } from './env';
import { getSession, type CustomerSession } from '@/services/auth';

export const SESSION_COOKIE = () => (env().NODE_ENV === 'production' ? '__Host-sd_session' : 'sd_session');
const MAX_BODY_BYTES = 64 * 1024;

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** __Host- cookies must be Secure, Path=/, and have no Domain: they cannot be set by a sibling subdomain. */
export function sessionCookie(token: string, expires: Date): string {
  const secure = env().NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE()}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure}`;
}
export const clearSessionCookie = (): string => `${SESSION_COOKIE()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env().NODE_ENV === 'production' ? '; Secure' : ''}`;

export type Ctx<B, P> = { req: Request; db: Db; ip: string; ua: string; body: B; params: P; query: URLSearchParams; session: CustomerSession; token: string | undefined };

type Opts<B> = {
  auth?: 'customer' | 'none';
  body?: ZodType<B>;
  /** Per-IP budget so a single client cannot hammer the endpoint. Keyed by route name. */
  limit?: { name: string; max: number; windowSec: number };
};

export const json = (data: unknown, status = 200, headers?: HeadersInit) => NextResponse.json(data, { status, headers });

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } }, { status: e.status, headers: e.headers });
  }
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return NextResponse.json({ error: { code: 'bad_request', message: first ? `${first.path.join('.') || 'request'}: ${first.message}` : 'Invalid request' } }, { status: 400 });
  }
  // Never leak internals. Log server-side with no request body.
  console.error('[api] unhandled', e instanceof Error ? e.stack ?? e.message : e);
  return NextResponse.json({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again' } }, { status: 500 });
}

/** Reads the body but stops as soon as it passes `max` bytes, so a huge upload cannot exhaust memory. */
export async function readTextCapped(req: Request, max: number): Promise<string> {
  if (Number(req.headers.get('content-length') ?? 0) > max) throw new ApiError('bad_request', 'Request is too large');
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); throw new ApiError('bad_request', 'Request is too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Reads a JSON body with a hard size cap, without trusting Content-Length alone. */
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new ApiError('bad_request', 'Request is too large');
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) throw new ApiError('bad_request', 'Send JSON');
  const text = await readTextCapped(req, MAX_BODY_BYTES);
  try { return text ? JSON.parse(text) : {}; } catch { throw new ApiError('bad_request', 'Invalid JSON'); }
}

/** One wrapper for every public route: origin check, rate limit, auth, validation, and safe errors. */
export function route<B = undefined, P = Record<string, string>>(opts: Opts<B>, handler: (c: Ctx<B, P>) => Promise<Response | unknown>) {
  return async (req: Request, routeCtx?: { params: Promise<P> }): Promise<Response> => {
    try {
      const ip = clientIp(req.headers);
      const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (mutating && !isTrustedOrigin(req.headers)) throw new ApiError('forbidden', 'Request blocked');
      const d = db();
      if (opts.limit) await enforceRateLimit(d, `api:${opts.limit.name}:${ip}`, opts.limit.max, opts.limit.windowSec);
      const token = readCookie(req, SESSION_COOKIE());
      let session: CustomerSession | null = null;
      if (opts.auth === 'customer') {
        session = await getSession(d, token);
        if (!session) throw unauthorized();
      }
      const body = (opts.body ? opts.body.parse(await readJson(req)) : undefined) as B;
      const params = (routeCtx?.params ? await routeCtx.params : {}) as P;
      const out = await handler({ req, db: d, ip, ua: userAgent(req.headers), body, params, query: new URL(req.url).searchParams, session: session as CustomerSession, token });
      return out instanceof Response ? out : json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
