import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { adminSessions, adminUsers, auditLog } from '@/db/schema';
import { audit } from '@/lib/audit';
import { assertCan, can } from '@/lib/rbac';
import { decryptSecret } from '@/lib/crypto';
import { base32Decode, base32Encode, hotp, totpStep } from '@/lib/totp';
import { adminLogout, adminPasswordLogin, adminVerifyTotp, getAdminSession } from '@/services/admin-auth';
import { createAdminUser, resetAdminCredentials, updateAdmin } from '@/services/admin-users';
import { freshDb } from './helpers';

let d: Db;
const meta = { ip: '5.5.5.5', ua: 'vitest' };
const PW = 'correct horse battery staple';

async function owner() {
  const c = await createAdminUser(d, null, { email: 'Owner@Saffron.test', name: 'Owner', role: 'owner', password: PW });
  const [row] = await d.select().from(adminUsers);
  return { c, id: row!.id };
}
const codeFor = async (offset = 0) => {
  const [row] = await d.select().from(adminUsers);
  return hotp(decryptSecret(row!.totpSecretEnc!), totpStep() + offset);
};

beforeEach(async () => { d = await freshDb(); });

describe('TOTP primitives', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(hotp(secret, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(hotp(secret, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(hotp(secret, Math.floor(20000000000 / 30), 8)).toBe('65353130');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
  });
});

describe('admin login (password + authenticator)', () => {
  it('requires both factors, and the password-stage token is not a session', async () => {
    await owner();
    const { token: pending } = await adminPasswordLogin(d, 'owner@saffron.test', PW, meta);
    expect(await getAdminSession(d, pending)).toBeNull(); // password alone gets nothing
    const full = await adminVerifyTotp(d, pending, await codeFor(), meta);
    expect(full.token).not.toBe(pending); // rotated
    expect(await getAdminSession(d, pending)).toBeNull();
    expect((await getAdminSession(d, full.token))?.role).toBe('owner');
  });

  it('gives the same error for unknown email, wrong password and wrong code', async () => {
    await owner();
    const msgs = new Set<string>();
    for (const [e, p] of [['nobody@x.test', PW], ['owner@saffron.test', 'wrong password!!']] as const) {
      msgs.add(await adminPasswordLogin(d, e, p, meta).then(() => 'ok', (x) => x.message));
    }
    const { token } = await adminPasswordLogin(d, 'owner@saffron.test', PW, meta);
    msgs.add(await adminVerifyTotp(d, token, '000000', meta).then(() => 'ok', (x) => x.message));
    expect(msgs.size).toBe(1);
  });

  it('a one-time code cannot be replayed', async () => {
    await owner();
    const code = await codeFor();
    const a = await adminPasswordLogin(d, 'owner@saffron.test', PW, meta);
    await adminVerifyTotp(d, a.token, code, meta);
    const b = await adminPasswordLogin(d, 'owner@saffron.test', PW, { ...meta, ip: '6.6.6.6' });
    await expect(adminVerifyTotp(d, b.token, code, meta)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('locks the account after 5 bad passwords, even for the right password', async () => {
    await owner();
    for (let i = 0; i < 5; i++) await expect(adminPasswordLogin(d, 'owner@saffron.test', 'nope nope nope', meta)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(adminPasswordLogin(d, 'owner@saffron.test', PW, meta)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('kills a pending login after 5 wrong codes', async () => {
    await owner();
    const { token } = await adminPasswordLogin(d, 'owner@saffron.test', PW, meta);
    for (let i = 0; i < 5; i++) await adminVerifyTotp(d, token, '000000', meta).catch(() => undefined);
    await expect(adminVerifyTotp(d, token, await codeFor(), meta)).rejects.toBeTruthy();
  });

  it('expires on idle and on logout, and ignores deactivated admins', async () => {
    const { id } = await owner();
    const { token: p } = await adminPasswordLogin(d, 'owner@saffron.test', PW, meta);
    const { token } = await adminVerifyTotp(d, p, await codeFor(), meta);
    await d.update(adminSessions).set({ lastSeenAt: new Date(Date.now() - 31 * 60_000) });
    expect(await getAdminSession(d, token)).toBeNull();

    const { token: p2 } = await adminPasswordLogin(d, 'owner@saffron.test', PW, { ...meta, ip: '7.7.7.7' });
    const full = await adminVerifyTotp(d, p2, await codeFor(1), meta);
    expect(await getAdminSession(d, full.token)).not.toBeNull();
    await d.update(adminUsers).set({ active: false }).where(eq(adminUsers.id, id));
    expect(await getAdminSession(d, full.token)).toBeNull();
    await d.update(adminUsers).set({ active: true }).where(eq(adminUsers.id, id));
    await adminLogout(d, full.token);
    expect(await getAdminSession(d, full.token)).toBeNull();
  });

  it('honours an IP allowlist', async () => {
    await owner();
    process.env.ADMIN_IP_ALLOWLIST = '10.0.0.1';
    (await import('@/lib/env')).resetEnvCache();
    await expect(adminPasswordLogin(d, 'owner@saffron.test', PW, meta)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(adminPasswordLogin(d, 'owner@saffron.test', PW, { ...meta, ip: '10.0.0.1' })).resolves.toBeTruthy();
    delete process.env.ADMIN_IP_ALLOWLIST;
    (await import('@/lib/env')).resetEnvCache();
  });

  it('stores password and authenticator secret only in protected form', async () => {
    const { c } = await owner();
    const [row] = await d.select().from(adminUsers);
    expect(row!.passwordHash).toMatch(/^scrypt\$/);
    expect(row!.passwordHash).not.toContain(PW);
    expect(row!.totpSecretEnc).not.toContain(c.totpSecret);
    expect(decryptSecret(row!.totpSecretEnc!)).toBe(c.totpSecret);
  });
});

describe('team management', () => {
  it('only owners manage the team; the last owner cannot be demoted; self-lockout is blocked', async () => {
    const { id } = await owner();
    const ownerCtx = { id, email: 'owner@saffron.test', role: 'owner' as const, ip: '', ua: '' };
    await expect(createAdminUser(d, { ...ownerCtx, role: 'manager' }, { email: 'x@y.test', name: 'X', role: 'staff' })).rejects.toMatchObject({ code: 'forbidden' });
    const staff = await createAdminUser(d, ownerCtx, { email: 'staff@saffron.test', name: 'S', role: 'staff' });
    expect(staff.password.length).toBeGreaterThanOrEqual(12);
    await expect(updateAdmin(d, ownerCtx, id, { role: 'manager' })).rejects.toMatchObject({ code: 'bad_request' });
    await expect(updateAdmin(d, ownerCtx, id, { active: false })).rejects.toMatchObject({ code: 'bad_request' });
    const [s] = await d.select().from(adminUsers).where(eq(adminUsers.email, 'staff@saffron.test'));
    const reset = await resetAdminCredentials(d, ownerCtx, s!.id);
    expect(reset.password).not.toBe(staff.password);
    expect((await d.select().from(auditLog)).map((r) => r.action)).toEqual(['admin.create', 'admin.reset_credentials']);
  });

  it('rejects weak passwords', async () => {
    for (const pw of ['short', 'aaaaaaaaaaaaaaaa', 'owner@saffron.test'.repeat(1)]) {
      await expect(createAdminUser(d, null, { email: 'owner@saffron.test', name: 'O', role: 'owner', password: pw })).rejects.toMatchObject({ code: 'bad_request' });
    }
  });

  it('role matrix', () => {
    expect(can('staff', 'orders.refund')).toBe(false);
    expect(can('staff', 'orders.update')).toBe(true);
    expect(can('manager', 'settings.write')).toBe(false);
    expect(can('manager', 'orders.refund')).toBe(true);
    expect(can('owner', 'team.manage')).toBe(true);
    expect(() => assertCan('staff', 'team.manage')).toThrow();
  });

  it('audit log redacts secrets', async () => {
    const ctx = { id: '00000000-0000-0000-0000-000000000000', email: 'a@b.test', role: 'owner' as const, ip: '', ua: '' };
    await audit(d, ctx, 'x', 'y', '1', { passwordHash: 'SECRET', totpSecretEnc: 'SECRET2', keep: 1 }, null);
    const [r] = await d.select().from(auditLog);
    expect(JSON.stringify(r)).not.toContain('SECRET');
    expect((r!.before as { keep: number }).keep).toBe(1);
  });
});
