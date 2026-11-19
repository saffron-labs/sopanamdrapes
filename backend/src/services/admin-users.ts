import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { adminUsers, type AdminRole, ADMIN_ROLES } from '@/db/schema';
import { audit, type AdminCtx } from '@/lib/audit';
import { encryptSecret, hashPassword, randomToken } from '@/lib/crypto';
import { assertCan } from '@/lib/rbac';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { generateTotpSecret, otpauthUri } from '@/lib/totp';
import { revokeAdminSessions, validateNewPassword } from './admin-auth';

export type NewAdminCredentials = { email: string; password: string; totpSecret: string; otpauthUri: string };

/** Shared by the CLI (first owner) and the Team page. Credentials are returned ONCE and never stored in readable form. */
export async function createAdminUser(db: Db, ctx: AdminCtx | null, input: { email: string; name: string; role: AdminRole; password?: string }): Promise<NewAdminCredentials> {
  if (ctx) assertCan(ctx.role, 'team.manage');
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Enter a valid email address');
  if (!ADMIN_ROLES.includes(input.role)) throw badRequest('Unknown role');
  const password = input.password ?? randomToken(15);
  validateNewPassword(password, email);
  const totpSecret = generateTotpSecret();
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email));
  if (existing) throw conflict('An admin with that email already exists');
  const [row] = await db.insert(adminUsers).values({
    email, name: input.name.trim().slice(0, 100) || email, role: input.role,
    passwordHash: await hashPassword(password), totpSecretEnc: encryptSecret(totpSecret),
  }).returning({ id: adminUsers.id });
  if (ctx) await audit(db, ctx, 'admin.create', 'admin_user', row!.id, null, { email, role: input.role });
  return { email, password, totpSecret, otpauthUri: otpauthUri(totpSecret, email) };
}

export async function listAdmins(db: Db, ctx: AdminCtx) {
  assertCan(ctx.role, 'team.manage');
  return db.select({ id: adminUsers.id, email: adminUsers.email, name: adminUsers.name, role: adminUsers.role, active: adminUsers.active, lastLoginAt: adminUsers.lastLoginAt, lockedUntil: adminUsers.lockedUntil }).from(adminUsers).orderBy(adminUsers.email);
}

async function activeOwners(db: Db) {
  return (await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.role, 'owner'))).length;
}

export async function updateAdmin(db: Db, ctx: AdminCtx, id: string, patch: { role?: AdminRole; active?: boolean }) {
  assertCan(ctx.role, 'team.manage');
  const [before] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
  if (!before) throw notFound('Admin not found');
  if (id === ctx.id && (patch.active === false || (patch.role && patch.role !== 'owner'))) throw badRequest('You cannot lock yourself out. Ask another owner to change your account');
  if (before.role === 'owner' && patch.role && patch.role !== 'owner' && (await activeOwners(db)) <= 1) throw badRequest('There must always be at least one owner');
  await db.update(adminUsers).set({ ...(patch.role ? { role: patch.role } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) }).where(eq(adminUsers.id, id));
  if (patch.active === false || patch.role) await revokeAdminSessions(db, id);
  await audit(db, ctx, 'admin.update', 'admin_user', id, { role: before.role, active: before.active }, patch);
}

/** Owner resets another admin: new password + new authenticator secret, all sessions revoked. */
export async function resetAdminCredentials(db: Db, ctx: AdminCtx, id: string): Promise<NewAdminCredentials> {
  assertCan(ctx.role, 'team.manage');
  const [a] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
  if (!a) throw notFound('Admin not found');
  const password = randomToken(15);
  const totpSecret = generateTotpSecret();
  await db.update(adminUsers).set({ passwordHash: await hashPassword(password), totpSecretEnc: encryptSecret(totpSecret), totpLastStep: 0, failedAttempts: 0, lockedUntil: null }).where(eq(adminUsers.id, id));
  await revokeAdminSessions(db, id);
  await audit(db, ctx, 'admin.reset_credentials', 'admin_user', id);
  return { email: a.email, password, totpSecret, otpauthUri: otpauthUri(totpSecret, a.email) };
}
