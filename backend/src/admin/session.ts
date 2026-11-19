import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { env } from '@/lib/env';
import { can, type Permission } from '@/lib/rbac';
import { clientIp, userAgent } from '@/lib/request-context';
import type { AdminCtx } from '@/lib/audit';
import { getAdminSession } from '@/services/admin-auth';

const prefix = () => (env().NODE_ENV === 'production' ? '__Host-' : '');
export const ADMIN_COOKIE = () => `${prefix()}sd_admin`;
export const PENDING_COOKIE = () => `${prefix()}sd_admin_pending`;

/** Admin cookies are SameSite=Strict: they are never sent on a cross-site request, which is the second wall behind the Server Action origin check. */
export const cookieOpts = (expires: Date) => ({ httpOnly: true, secure: env().NODE_ENV === 'production', sameSite: 'strict' as const, path: '/', expires });

export async function requestMeta() {
  const h = await headers();
  return { ip: clientIp(h), ua: userAgent(h) };
}

export async function currentAdmin(): Promise<AdminCtx | null> {
  const token = (await cookies()).get(ADMIN_COOKIE())?.value;
  if (!token) return null;
  const { ip } = await requestMeta();
  return getAdminSession(db(), token, ip);
}

/** Every admin page and action calls this first. The proxy is only a convenience redirect, never the security boundary. */
export async function requireAdmin(permission?: Permission): Promise<AdminCtx> {
  const ctx = await currentAdmin();
  if (!ctx) redirect('/admin/login');
  if (permission && !can(ctx.role, permission)) redirect('/admin?err=' + encodeURIComponent('You do not have access to that page'));
  return ctx;
}
