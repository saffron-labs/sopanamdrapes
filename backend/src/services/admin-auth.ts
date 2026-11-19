import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { adminSessions, adminUsers, type AdminRole } from '@/db/schema';
import type { AdminCtx } from '@/lib/audit';
import { decryptSecret, dummyPasswordHash, hashPassword, hmac, randomToken, verifyPassword } from '@/lib/crypto';
import { ApiError, badRequest } from '@/lib/errors';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verifyTotp } from '@/lib/totp';
import { env } from '@/lib/env';

const PENDING_TTL_MS = 5 * 60_000;
const ABSOLUTE_TTL_MS = 8 * 3600_000;
const IDLE_TTL_MS = 30 * 60_000;
const TOUCH_EVERY_MS = 60_000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const MAX_TOTP_TRIES = 5;

// One message for every failure mode so the form cannot be used to discover which emails are admins.
const FAIL = 'Incorrect email, password or code';
const fail = () => new ApiError('unauthorized', FAIL);

export function validateNewPassword(password: string, email: string) {
  if (password.length < 12) throw badRequest('Use at least 12 characters');
  if (password.length > 200) throw badRequest('That password is too long');
  if (password.toLowerCase().includes(email.split('@')[0]!.toLowerCase()) && email.split('@')[0]!.length >= 4) throw badRequest('The password should not contain your email name');
  if (/^(.)\1+$/.test(password) || ['password1234', '123456789012', 'qwertyuiopas'].includes(password.toLowerCase())) throw badRequest('Choose a less guessable password');
}

export function ipAllowed(ip: string): boolean {
  const list = env().ADMIN_IP_ALLOWLIST;
  return list.length === 0 || list.includes(ip);
}

/** Step 1: email + password. Returns a short-lived "password" stage token, useless on its own. */
export async function adminPasswordLogin(db: Db, emailRaw: string, password: string, meta: { ip: string; ua: string }): Promise<{ token: string }> {
  if (!ipAllowed(meta.ip)) throw fail();
  const email = emailRaw.trim().toLowerCase().slice(0, 200);
  await enforceRateLimit(db, `adm:ip:${meta.ip}`, 20, 900);
  await enforceRateLimit(db, `adm:email:${email}`, 10, 900);

  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
  // Always burn the same CPU time, whether or not the account exists.
  const ok = await verifyPassword(password.slice(0, 200), admin?.passwordHash ?? (await dummyPasswordHash()));
  const now = new Date();

  if (!admin || !admin.active || (admin.lockedUntil && admin.lockedUntil > now)) throw fail();
  if (!ok) {
    await recordFailure(db, admin.id);
    throw fail();
  }
  if (!admin.totpSecretEnc) throw new ApiError('forbidden', 'This account has no authenticator set up. Ask the owner to reset it');

  const token = randomToken(32);
  await db.insert(adminSessions).values({
    idHash: hmac(token, 'admin-session'), adminId: admin.id, stage: 'password',
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS), ip: meta.ip, userAgent: meta.ua,
  });
  return { token };
}

async function recordFailure(db: Db, adminId: string) {
  const [row] = await db.update(adminUsers).set({ failedAttempts: sql`${adminUsers.failedAttempts} + 1` }).where(eq(adminUsers.id, adminId)).returning({ n: adminUsers.failedAttempts });
  if ((row?.n ?? 0) >= MAX_FAILURES) {
    await db.update(adminUsers).set({ lockedUntil: new Date(Date.now() + LOCK_MS), failedAttempts: 0 }).where(eq(adminUsers.id, adminId));
    await db.delete(adminSessions).where(eq(adminSessions.adminId, adminId));
  }
}

/** Step 2: authenticator code. Rotates the token (no session fixation) and returns the full session. */
export async function adminVerifyTotp(db: Db, pendingToken: string | undefined, code: string, meta: { ip: string; ua: string }): Promise<{ token: string; expiresAt: Date }> {
  if (!pendingToken) throw fail();
  const pendingHash = hmac(pendingToken, 'admin-session');
  await enforceRateLimit(db, `admtotp:ip:${meta.ip}`, 30, 900);

  const [pending] = await db.select().from(adminSessions)
    .where(and(eq(adminSessions.idHash, pendingHash), eq(adminSessions.stage, 'password'), gt(adminSessions.expiresAt, new Date())));
  if (!pending) throw fail();
  const tries = await enforceTotpTries(db, pendingHash);
  if (!tries) { await db.delete(adminSessions).where(eq(adminSessions.idHash, pendingHash)); throw fail(); }

  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, pending.adminId));
  if (!admin || !admin.active || !admin.totpSecretEnc || (admin.lockedUntil && admin.lockedUntil > new Date())) throw fail();

  const step = verifyTotp(decryptSecret(admin.totpSecretEnc), code.trim());
  if (step === null) { await recordFailure(db, admin.id); throw fail(); }

  // Replay protection: a code (time step) can be used once. The conditional update is the atomic guard.
  const claimed = await db.update(adminUsers).set({ totpLastStep: step, failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(and(eq(adminUsers.id, admin.id), lt(adminUsers.totpLastStep, step))).returning({ id: adminUsers.id });
  if (claimed.length === 0) throw fail();

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ABSOLUTE_TTL_MS);
  await db.transaction(async (tx) => {
    await tx.delete(adminSessions).where(eq(adminSessions.idHash, pendingHash));
    await tx.insert(adminSessions).values({ idHash: hmac(token, 'admin-session'), adminId: admin.id, stage: 'full', expiresAt, ip: meta.ip, userAgent: meta.ua });
  });
  return { token, expiresAt };
}

async function enforceTotpTries(db: Db, pendingHash: string): Promise<boolean> {
  try { await enforceRateLimit(db, `admtotp:s:${pendingHash}`, MAX_TOTP_TRIES, 300); return true; } catch { return false; }
}

export async function getAdminSession(db: Db, token: string | undefined, ip?: string): Promise<AdminCtx | null> {
  if (!token || token.length < 32 || token.length > 100) return null;
  if (ip !== undefined && !ipAllowed(ip)) return null;
  const idHash = hmac(token, 'admin-session');
  const [row] = await db.select({ s: adminSessions, a: adminUsers }).from(adminSessions).innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminId)).where(eq(adminSessions.idHash, idHash));
  const now = Date.now();
  if (!row || row.s.stage !== 'full' || !row.a.active) return null;
  if (row.s.expiresAt.getTime() <= now || now - row.s.lastSeenAt.getTime() > IDLE_TTL_MS) {
    await db.delete(adminSessions).where(eq(adminSessions.idHash, idHash));
    return null;
  }
  if (now - row.s.lastSeenAt.getTime() > TOUCH_EVERY_MS) await db.update(adminSessions).set({ lastSeenAt: new Date(now) }).where(eq(adminSessions.idHash, idHash));
  return { id: row.a.id, email: row.a.email, role: row.a.role, ip: ip ?? row.s.ip ?? '', ua: row.s.userAgent ?? '' };
}

export async function adminLogout(db: Db, token: string | undefined) {
  if (token) await db.delete(adminSessions).where(eq(adminSessions.idHash, hmac(token, 'admin-session')));
}

export async function revokeAdminSessions(db: Db, adminId: string, exceptToken?: string) {
  const keep = exceptToken ? hmac(exceptToken, 'admin-session') : null;
  await db.delete(adminSessions).where(keep ? and(eq(adminSessions.adminId, adminId), sql`${adminSessions.idHash} <> ${keep}`) : eq(adminSessions.adminId, adminId));
}

export async function changeOwnPassword(db: Db, ctx: AdminCtx, current: string, next: string, currentToken: string | undefined) {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, ctx.id));
  if (!admin || !(await verifyPassword(current, admin.passwordHash))) throw new ApiError('unauthorized', 'Your current password is incorrect');
  validateNewPassword(next, admin.email);
  await db.update(adminUsers).set({ passwordHash: await hashPassword(next) }).where(eq(adminUsers.id, ctx.id));
  await revokeAdminSessions(db, ctx.id, currentToken);
}

export async function purgeExpiredAdminSessions(db: Db) {
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
}

export type { AdminRole };
