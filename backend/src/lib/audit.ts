import type { Executor } from '@/db/client';
import { auditLog } from '@/db/schema';

export type AdminCtx = { id: string; email: string; role: import('@/db/schema').AdminRole; ip: string; ua: string };

/** Fields that must never reach the audit log. */
const REDACT = new Set(['passwordHash', 'totpSecretEnc', 'password']);

function clean(v: unknown): unknown {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v, (k, val) => (REDACT.has(k) ? '[redacted]' : val)));
}

/** Writes inside the same transaction as the change, so a change can never happen without its record. */
export async function audit(ex: Executor, ctx: AdminCtx, action: string, entity: string, entityId: string, before?: unknown, after?: unknown) {
  await ex.insert(auditLog).values({
    adminId: ctx.id, adminEmail: ctx.email, action, entity, entityId,
    before: clean(before) as never, after: clean(after) as never, ip: ctx.ip, userAgent: ctx.ua,
  });
}
