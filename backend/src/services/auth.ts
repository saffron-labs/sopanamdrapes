import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { customers, otpChallenges, sessions } from '@/db/schema';
import { hmac, numericCode, randomToken, safeEqual } from '@/lib/crypto';
import { ApiError, badRequest } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendOtp } from './otp-sender';

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 30;
const SESSION_IDLE_MS = 30 * 24 * 3600_000;
const SESSION_ABSOLUTE_MS = 90 * 24 * 3600_000;
const TOUCH_EVERY_MS = 10 * 60_000;

/** Accepts 9876543210, 09876543210, 919876543210, +91 98765 43210. Indian mobiles only. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s\-().]/g, '');
  const m = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits);
  if (!m) throw badRequest('Enter a valid 10-digit Indian mobile number');
  return `+91${m[1]}`;
}

export async function requestOtp(db: Db, rawPhone: string, ip: string) {
  const phone = normalizePhone(rawPhone);
  const recent = await db.select({ createdAt: otpChallenges.createdAt }).from(otpChallenges)
    .where(eq(otpChallenges.phone, phone)).orderBy(desc(otpChallenges.createdAt)).limit(1);
  const last = recent[0];
  if (last) {
    const wait = RESEND_COOLDOWN_SEC - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
    if (wait > 0) throw new ApiError('rate_limited', `Please wait ${wait}s before requesting another code`, { retryAfter: wait }, { 'Retry-After': String(wait) });
  }

  await enforceRateLimit(db, `otp:ip:${ip}`, 20, 3600);
  await enforceRateLimit(db, 'otp:global', 600, 3600, 'We are seeing unusually high demand. Please try again in a few minutes');
  await enforceRateLimit(db, `otp:phone:${phone}`, 5, 900, 'Too many codes requested for this number. Please try again in a few minutes');

  const [existing] = await db.select({ status: customers.status }).from(customers).where(eq(customers.phone, phone));
  const code = numericCode(6);
  await db.insert(otpChallenges).values({ phone, codeHash: hmac(`${phone}:${code}`, 'otp'), expiresAt: new Date(Date.now() + OTP_TTL_MS), ip });
  // Blocked customers get the same response but no code, so the endpoint cannot be used to probe account state.
  if (existing?.status !== 'blocked') await sendOtp(phone, code);
  return { ok: true as const, expiresInSec: OTP_TTL_MS / 1000, resendInSec: RESEND_COOLDOWN_SEC };
}

export type SessionInfo = { token: string; customer: { id: string; phone: string; name: string; email: string | null }; expiresAt: Date; isNew: boolean };

export async function verifyOtp(db: Db, rawPhone: string, code: string, meta: { ip: string; ua: string }): Promise<SessionInfo> {
  const phone = normalizePhone(rawPhone);
  if (!/^\d{6}$/.test(code)) throw badRequest('Enter the 6-digit code');
  await enforceRateLimit(db, `otpv:ip:${meta.ip}`, 30, 900);
  await enforceRateLimit(db, `otpv:phone:${phone}`, 10, 900);

  const invalid = () => badRequest('That code is incorrect or has expired');

  const [latest] = await db.select().from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
    .orderBy(desc(otpChallenges.createdAt)).limit(1);
  if (!latest) throw invalid();

  // Count the guess BEFORE comparing, atomically and capped, so parallel requests cannot exceed the attempt limit.
  const [ch] = await db.update(otpChallenges).set({ attempts: sql`${otpChallenges.attempts} + 1` })
    .where(and(eq(otpChallenges.id, latest.id), isNull(otpChallenges.consumedAt), lt(otpChallenges.attempts, OTP_MAX_ATTEMPTS)))
    .returning();
  if (!ch) throw invalid();
  if (!safeEqual(ch.codeHash, hmac(`${phone}:${code}`, 'otp'))) throw invalid();

  return db.transaction(async (tx) => {
    // One-time use, guarded against concurrent verification of the same code.
    const consumed = await tx.update(otpChallenges).set({ consumedAt: new Date() })
      .where(and(eq(otpChallenges.id, ch.id), isNull(otpChallenges.consumedAt))).returning({ id: otpChallenges.id });
    if (consumed.length === 0) throw invalid();

    const [existing] = await tx.select().from(customers).where(eq(customers.phone, phone));
    if (existing?.status === 'blocked') throw invalid();
    let customer = existing;
    let isNew = false;
    if (!customer) {
      [customer] = await tx.insert(customers).values({ phone, lastLoginAt: new Date() }).returning();
      isNew = true;
    } else {
      await tx.update(customers).set({ lastLoginAt: new Date() }).where(eq(customers.id, customer.id));
    }
    if (!customer) throw new Error('customer upsert failed');

    const token = randomToken(32);
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_IDLE_MS);
    await tx.insert(sessions).values({
      idHash: hmac(token, 'session'), customerId: customer.id, expiresAt,
      absoluteExpiresAt: new Date(now + SESSION_ABSOLUTE_MS), ip: meta.ip, userAgent: meta.ua,
    });
    return { token, customer: { id: customer.id, phone: customer.phone, name: customer.name, email: customer.email }, expiresAt, isNew };
  });
}

export type CustomerSession = { customerId: string; phone: string; name: string; email: string | null; sessionHash: string };

export async function getSession(db: Db, token: string | undefined): Promise<CustomerSession | null> {
  if (!token || token.length < 32 || token.length > 100) return null;
  const idHash = hmac(token, 'session');
  const now = new Date();
  const [row] = await db.select({
    s: sessions, c: customers,
  }).from(sessions).innerJoin(customers, eq(customers.id, sessions.customerId)).where(eq(sessions.idHash, idHash));
  if (!row || row.s.expiresAt <= now || row.s.absoluteExpiresAt <= now || row.c.status !== 'active') return null;

  if (now.getTime() - row.s.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    const next = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, row.s.absoluteExpiresAt.getTime()));
    await db.update(sessions).set({ lastSeenAt: now, expiresAt: next }).where(eq(sessions.idHash, idHash));
  }
  return { customerId: row.c.id, phone: row.c.phone, name: row.c.name, email: row.c.email, sessionHash: idHash };
}

export async function logout(db: Db, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.idHash, hmac(token, 'session')));
}

export async function logoutEverywhere(db: Db, customerId: string) {
  await db.delete(sessions).where(eq(sessions.customerId, customerId));
}

export async function purgeExpiredAuth(db: Db) {
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(otpChallenges).where(lt(otpChallenges.expiresAt, new Date(now.getTime() - 3600_000)));
}
