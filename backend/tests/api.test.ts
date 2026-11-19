import { beforeEach, describe, expect, it } from 'vitest';
import { otpChallenges } from '@/db/schema';
import { setOtpSender } from '@/services/otp-sender';
import { setSetting, seedCatalogue } from './fixtures';
import { freshDb } from './helpers';
import type { Db } from '@/db/client';

import { POST as otpRequest } from '@/app/api/v1/auth/otp/request/route';
import { POST as otpVerify } from '@/app/api/v1/auth/otp/verify/route';
import { POST as logoutRoute } from '@/app/api/v1/auth/logout/route';
import { GET as meGet } from '@/app/api/v1/me/route';
import { POST as addrPost } from '@/app/api/v1/addresses/route';
import { POST as quotePost } from '@/app/api/v1/quote/route';
import { GET as ordersGet, POST as ordersPost } from '@/app/api/v1/orders/route';
import { GET as orderGet } from '@/app/api/v1/orders/[id]/route';
import { POST as cancelPost } from '@/app/api/v1/orders/[id]/cancel/route';
import { GET as catalogGet } from '@/app/api/v1/catalog/route';
import { GET as cronGet } from '@/app/api/v1/cron/maintenance/route';
import { POST as webhookPost } from '@/app/api/v1/webhooks/razorpay/route';

let d: Db;
let code = '';
const ORIGIN = 'http://localhost:3000';

beforeEach(async () => {
  d = await freshDb();
  await seedCatalogue(d);
  setOtpSender(async (_p, c) => { code = c; });
});

const call = (h: (r: Request, c?: never) => Promise<Response>, method: string, url: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}) =>
  h(new Request(`${ORIGIN}${url}`, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }));
const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

async function login(phone = '9876543210'): Promise<string> {
  expect((await call(otpRequest, 'POST', '/api/v1/auth/otp/request', { phone })).status).toBe(200);
  await d.update(otpChallenges).set({ createdAt: new Date(Date.now() - 60_000) });
  const r = await call(otpVerify, 'POST', '/api/v1/auth/otp/verify', { phone, code });
  expect(r.status).toBe(200);
  const setCookie = r.headers.get('set-cookie')!;
  expect(setCookie).toMatch(/HttpOnly/);
  expect(setCookie).toMatch(/SameSite=Lax/);
  expect(await r.clone().text()).not.toContain(setCookie.split(';')[0]!.split('=')[1]!); // token is never in the body
  return setCookie.split(';')[0]!;
}

describe('public API', () => {
  it('serves the catalogue without auth and never exposes cost or stock internals', async () => {
    const r = await call(catalogGet, 'GET', '/api/v1/catalog');
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.sarees.length).toBeGreaterThan(0);
    expect(JSON.stringify(j)).not.toMatch(/passwordHash|lowStockThreshold/);
  });

  it('blocks cross-site mutations and unauthenticated access', async () => {
    const evil = await otpRequest(new Request(`${ORIGIN}/api/v1/auth/otp/request`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ phone: '9876543210' }) }));
    expect(evil.status).toBe(403);
    const noOrigin = await otpRequest(new Request(`${ORIGIN}/api/v1/auth/otp/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"phone":"9876543210"}' }));
    expect(noOrigin.status).toBe(403);
    expect((await call(meGet, 'GET', '/api/v1/me')).status).toBe(401);
    expect((await call(ordersGet, 'GET', '/api/v1/orders')).status).toBe(401);
  });

  it('rejects malformed, oversized and unknown-field bodies with safe errors', async () => {
    expect((await call(otpRequest, 'POST', '/api/v1/auth/otp/request', { phone: '9876543210', admin: true })).status).toBe(400);
    expect((await otpRequest(new Request(`${ORIGIN}/x`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: '{not json' }))).status).toBe(400);
    expect((await otpRequest(new Request(`${ORIGIN}/x`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: ORIGIN }, body: 'phone=1' }))).status).toBe(400);
    const big = await otpRequest(new Request(`${ORIGIN}/x`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ phone: 'x'.repeat(100_000) }) }));
    expect(big.status).toBe(400);
  });

  it('full customer journey: login, address, quote, COD order, view, cancel, logout', async () => {
    await setSetting(d, 'codEnabled', true);
    const cookie = await login();
    const me = await (await call(meGet, 'GET', '/api/v1/me', undefined, cookie)).json();
    expect(me.customer.phone).toBe('+919876543210');

    const a = await (await call(addrPost, 'POST', '/api/v1/addresses', { name: 'Asha', phone: '9876543210', line1: '12 MG Road', city: 'Kochi', state: 'Kerala', pincode: '682001' }, cookie)).json();
    expect(a.address.isDefault).toBe(true);
    expect((await call(addrPost, 'POST', '/api/v1/addresses', { name: 'A', phone: '9876543210', line1: 'x', city: 'k', state: 'k', pincode: '12' }, cookie)).status).toBe(400);

    const looks = [{ sareeId: 'SA00007', ornamentIds: [], qty: 1 }];
    const q = await call(quotePost, 'POST', '/api/v1/quote', { looks, paymentMethod: 'cod' }, cookie);
    expect(q.status).toBe(200);
    // Clients cannot inject prices: unknown fields are refused.
    expect((await call(quotePost, 'POST', '/api/v1/quote', { looks: [{ ...looks[0], price: 1 }], paymentMethod: 'cod' }, cookie)).status).toBe(400);

    const key = 'idem-key-12345';
    const o1 = await call(ordersPost, 'POST', '/api/v1/orders', { looks, paymentMethod: 'cod', addressId: a.address.id }, cookie, { 'idempotency-key': key });
    expect(o1.status).toBe(201);
    const order = (await o1.json()).order;
    const o2 = await call(ordersPost, 'POST', '/api/v1/orders', { looks, paymentMethod: 'cod', addressId: a.address.id }, cookie, { 'idempotency-key': key });
    expect(o2.status).toBe(200);
    expect((await o2.json()).order.id).toBe(order.id);

    const list = await (await call(ordersGet, 'GET', '/api/v1/orders', undefined, cookie)).json();
    expect(list).toHaveLength(1);
    const detail = await orderGet(new Request(`${ORIGIN}/x`, { headers: { cookie } }), ctxFor(order.id));
    expect(detail.status).toBe(200);

    // Another customer cannot read or cancel it.
    const other = await login('9123456780');
    const peek = await orderGet(new Request(`${ORIGIN}/x`, { headers: { cookie: other } }), ctxFor(order.id));
    expect(peek.status).toBe(404);
    const steal = await cancelPost(new Request(`${ORIGIN}/x`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: other }, body: JSON.stringify({ reason: 'not mine' }) }), ctxFor(order.id));
    expect(steal.status).toBe(404);

    const cancel = await cancelPost(new Request(`${ORIGIN}/x`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie }, body: JSON.stringify({ reason: 'changed my mind' }) }), ctxFor(order.id));
    expect(cancel.status).toBe(200);
    expect((await cancel.json()).status).toBe('cancelled');

    const out = await call(logoutRoute, 'POST', '/api/v1/auth/logout', {}, cookie);
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect((await call(meGet, 'GET', '/api/v1/me', undefined, cookie)).status).toBe(401);
  });

  it('webhook rejects unsigned bodies; cron needs the secret', async () => {
    const wh = await webhookPost(new Request(`${ORIGIN}/api/v1/webhooks/razorpay`, { method: 'POST', body: '{"event":"payment.captured"}' }));
    expect([400, 401]).toContain(wh.status);
    expect((await cronGet(new Request(`${ORIGIN}/c`))).status).toBe(401);
    expect((await cronGet(new Request(`${ORIGIN}/c`, { headers: { authorization: 'Bearer wrong-secret-wrong' } }))).status).toBe(401);
    const ok = await cronGet(new Request(`${ORIGIN}/c`, { headers: { authorization: 'Bearer cron-secret-cron-secret' } }));
    expect(ok.status).toBe(200);
  });
});

describe('production configuration guard', () => {
  it('refuses to start production with unsafe or incomplete settings', async () => {
    const { env, resetEnvCache } = await import('@/lib/env');
    const keep = { ...process.env };
    try {
      Object.assign(process.env, { NODE_ENV: 'production', APP_ORIGIN: 'http://insecure.example', OTP_DRIVER: 'console', TRUST_PROXY: '0', STORAGE_DRIVER: 'local' });
      resetEnvCache();
      expect(() => env()).toThrow(/APP_ORIGIN[\s\S]*OTP_DRIVER[\s\S]*TRUST_PROXY|TRUST_PROXY[\s\S]*STORAGE_DRIVER/);
    } finally { process.env = keep; resetEnvCache(); }
  });
});

describe('request hygiene', () => {
  it('uses the proxy-observed client IP, not a spoofed X-Forwarded-For prefix', async () => {
    const { clientIp } = await import('@/lib/request-context');
    expect(clientIp(new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '6.6.6.6' }))).toBe('198.51.100.4');
  });

  it('stops reading a body without Content-Length once it passes the cap', async () => {
    const { readTextCapped } = await import('@/lib/http');
    const big = new ReadableStream({ start(c) { for (let i = 0; i < 20; i++) c.enqueue(new Uint8Array(10_000)); c.close(); } });
    const req = new Request('http://localhost/x', { method: 'POST', body: big, duplex: 'half' } as RequestInit);
    await expect(readTextCapped(req, 64 * 1024)).rejects.toThrow(/too large/);
  });

  it('CSV export neutralises formulas, including ones hidden behind spaces', async () => {
    const { csvCell } = await import('@/services/admin-orders');
    for (const v of ['=HYPERLINK("x")', ' =1+1', '+91 98', '-2', '@SUM(A1)']) expect(csvCell(v).startsWith(`"'`)).toBe(true);
    expect(csvCell('Asha')).toBe('"Asha"');
  });
});
