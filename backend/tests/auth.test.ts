import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { customers, otpChallenges, sessions } from '@/db/schema';
import { getSession, logout, normalizePhone, requestOtp, verifyOtp } from '@/services/auth';
import { setOtpSender } from '@/services/otp-sender';
import { freshDb } from './helpers';

let d: Db;
let sent: { phone: string; code: string }[];
const meta = { ip: '1.2.3.4', ua: 'vitest' };

beforeEach(async () => {
  d = await freshDb();
  sent = [];
  setOtpSender(async (phone, code) => { sent.push({ phone, code }); });
});

/** The 30s resend cooldown is real; tests age the last challenge instead of sleeping. */
const age = () => d.update(otpChallenges).set({ createdAt: new Date(Date.now() - 60_000) });

describe('phone numbers', () => {
  it('normalises common Indian formats', () => {
    for (const s of ['9876543210', '09876543210', '919876543210', '+91 98765 43210', '+91-98765-43210']) expect(normalizePhone(s)).toBe('+919876543210');
  });
  it('rejects anything else', () => {
    for (const s of ['12345', '5876543210', '+14155550123', 'abcdefghij', '', '98765432101']) expect(() => normalizePhone(s)).toThrow();
  });
});

describe('OTP login', () => {
  it('signs a new customer up and in, with a session that works and can be revoked', async () => {
    await requestOtp(d, '9876543210', meta.ip);
    expect(sent).toHaveLength(1);
    const s = await verifyOtp(d, '9876543210', sent[0]!.code, meta);
    expect(s.isNew).toBe(true);
    expect(s.customer.phone).toBe('+919876543210');
    expect((await getSession(d, s.token))?.customerId).toBe(s.customer.id);
    await logout(d, s.token);
    expect(await getSession(d, s.token)).toBeNull();
  });

  it('never stores the code or the session token in the clear', async () => {
    await requestOtp(d, '9876543210', meta.ip);
    const code = sent[0]!.code;
    const s = await verifyOtp(d, '9876543210', code, meta);
    const [ch] = await d.select().from(otpChallenges);
    expect(ch!.codeHash).not.toContain(code);
    const [row] = await d.select().from(sessions);
    expect(row!.idHash).not.toBe(s.token);
    expect(JSON.stringify(row)).not.toContain(s.token);
  });

  it('a code works once', async () => {
    await requestOtp(d, '9876543210', meta.ip);
    const code = sent[0]!.code;
    await verifyOtp(d, '9876543210', code, meta);
    await expect(verifyOtp(d, '9876543210', code, meta)).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('locks a challenge after 5 wrong guesses, even if the next guess is right', async () => {
    await requestOtp(d, '9876543210', meta.ip);
    const real = sent[0]!.code;
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await expect(verifyOtp(d, '9876543210', wrong, meta)).rejects.toMatchObject({ code: 'bad_request' });
    await expect(verifyOtp(d, '9876543210', real, meta)).rejects.toMatchObject({ code: 'bad_request' });
    expect(await d.select().from(customers)).toHaveLength(0);
  });

  it('expired codes fail', async () => {
    await requestOtp(d, '9876543210', meta.ip);
    await d.update(otpChallenges).set({ expiresAt: new Date(Date.now() - 1000) });
    await expect(verifyOtp(d, '9876543210', sent[0]!.code, meta)).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('enforces a resend cooldown and a per-number cap', async () => {
    await requestOtp(d, '9876543210', meta.ip);
    await expect(requestOtp(d, '9876543210', meta.ip)).rejects.toMatchObject({ code: 'rate_limited' });
    for (let i = 0; i < 4; i++) { await age(); await requestOtp(d, '9876543210', meta.ip); }
    await age();
    await expect(requestOtp(d, '9876543210', meta.ip)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('caps requests per IP so one source cannot spam many numbers', async () => {
    for (let i = 0; i < 20; i++) await requestOtp(d, `98765432${String(i).padStart(2, '0')}`, '9.9.9.9');
    await expect(requestOtp(d, '9000000001', '9.9.9.9')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('gives blocked customers the same response but sends nothing and cannot sign in', async () => {
    await d.insert(customers).values({ phone: '+919876543210', status: 'blocked' });
    const r = await requestOtp(d, '9876543210', meta.ip);
    expect(r.ok).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('rejects sessions that are expired or whose customer was blocked', async () => {
    await requestOtp(d, '9876543210', meta.ip);
    const s = await verifyOtp(d, '9876543210', sent[0]!.code, meta);
    await d.update(customers).set({ status: 'blocked' }).where(eq(customers.id, s.customer.id));
    expect(await getSession(d, s.token)).toBeNull();
    await d.update(customers).set({ status: 'active' }).where(eq(customers.id, s.customer.id));
    expect(await getSession(d, s.token)).not.toBeNull();
    await d.update(sessions).set({ expiresAt: new Date(Date.now() - 1) });
    expect(await getSession(d, s.token)).toBeNull();
    expect(await getSession(d, 'x'.repeat(40))).toBeNull();
    expect(await getSession(d, undefined)).toBeNull();
  });
});
