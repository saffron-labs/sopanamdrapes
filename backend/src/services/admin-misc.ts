import { and, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { auditLog, customers, orderEvents, orders, ornaments, promoCodes, sarees, sessions } from '@/db/schema';
import { audit, type AdminCtx } from '@/lib/audit';
import { badRequest, notFound } from '@/lib/errors';
import { assertCan } from '@/lib/rbac';
import { rowsOf } from '@/lib/sql-rows';
import { saveSettings, settingsSchema, type Settings } from '@/lib/settings';

// ───────────── Customers ─────────────
export async function listCustomers(db: Db, ctx: AdminCtx, q?: string, page = 1) {
  assertCan(ctx.role, 'customers.read');
  const like = q?.trim() ? `%${q.trim().replace(/[%_\\]/g, '\\$&')}%` : null;
  const w = like ? or(ilike(customers.phone, like), ilike(customers.name, like), ilike(customers.email, like)) : undefined;
  const rows = await db.select({
    c: customers,
    orders: sql<number>`(select count(*)::int from orders o where o.customer_id = ${customers.id} and o.status not in ('pending_payment','cancelled'))`,
    spent: sql<number>`coalesce((select sum(total_paise)::int from orders o where o.customer_id = ${customers.id} and o.status not in ('pending_payment','cancelled','returned')), 0)`,
  }).from(customers).where(w).orderBy(desc(customers.createdAt)).limit(25).offset((Math.max(page, 1) - 1) * 25);
  return rows;
}

export async function customerDetail(db: Db, ctx: AdminCtx, id: string) {
  assertCan(ctx.role, 'customers.read');
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  if (!c) throw notFound('Customer not found');
  const os = await db.select().from(orders).where(and(eq(orders.customerId, id), ne(orders.status, 'pending_payment'))).orderBy(desc(orders.createdAt)).limit(50);
  return { customer: c, orders: os };
}

export async function setCustomerBlocked(db: Db, ctx: AdminCtx, id: string, blocked: boolean) {
  assertCan(ctx.role, 'customers.read');
  assertCan(ctx.role, 'orders.update'); // blocking needs the same trust level as handling orders
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ status: customers.status }).from(customers).where(eq(customers.id, id));
    if (!before) throw notFound('Customer not found');
    await tx.update(customers).set({ status: blocked ? 'blocked' : 'active' }).where(eq(customers.id, id));
    if (blocked) await tx.delete(sessions).where(eq(sessions.customerId, id));
    await audit(tx, ctx, blocked ? 'customer.block' : 'customer.unblock', 'customer', id, before, { status: blocked ? 'blocked' : 'active' });
  });
}

// ───────────── Promo codes ─────────────
export const promoInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, '3-24 letters, numbers, - or _'),
  kind: z.enum(['percent', 'flat']),
  value: z.number().int().min(1),
  minSubtotalRupees: z.number().int().min(0).max(10_000_000).default(0),
  maxDiscountRupees: z.number().int().min(1).max(10_000_000).nullable().default(null),
  startsAt: z.date().nullable().default(null),
  endsAt: z.date().nullable().default(null),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().default(null),
  perCustomerLimit: z.number().int().min(1).max(100).default(1),
  note: z.string().trim().max(200).default(''),
}).refine((v) => v.kind !== 'percent' || v.value <= 90, { message: 'Percentage must be 90 or less', path: ['value'] })
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, { message: 'End must be after start', path: ['endsAt'] });

export async function listPromos(db: Db, ctx: AdminCtx) {
  assertCan(ctx.role, 'orders.read');
  return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
}

export async function savePromo(db: Db, ctx: AdminCtx, raw: unknown) {
  assertCan(ctx.role, 'promos.write');
  const p = promoInput.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const v = p.data;
  const row = {
    code: v.code, kind: v.kind, value: v.kind === 'flat' ? v.value * 100 : v.value, minSubtotalPaise: v.minSubtotalRupees * 100,
    maxDiscountPaise: v.maxDiscountRupees ? v.maxDiscountRupees * 100 : null, startsAt: v.startsAt, endsAt: v.endsAt,
    usageLimit: v.usageLimit, perCustomerLimit: v.perCustomerLimit, note: v.note,
  };
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(promoCodes).where(eq(promoCodes.code, v.code));
    if (before) await tx.update(promoCodes).set(row).where(eq(promoCodes.code, v.code));
    else await tx.insert(promoCodes).values(row);
    await audit(tx, ctx, before ? 'promo.update' : 'promo.create', 'promo', v.code, before ?? null, row);
  });
}

export async function setPromoActive(db: Db, ctx: AdminCtx, code: string, active: boolean) {
  assertCan(ctx.role, 'promos.write');
  const r = await db.update(promoCodes).set({ active }).where(eq(promoCodes.code, code)).returning({ code: promoCodes.code });
  if (!r.length) throw notFound('Promo code not found');
  await audit(db, ctx, active ? 'promo.enable' : 'promo.disable', 'promo', code);
}

// ───────────── Settings ─────────────
export async function updateSettings(db: Db, ctx: AdminCtx, patch: unknown) {
  assertCan(ctx.role, 'settings.write');
  const parsed = settingsSchema.partial().safeParse(patch);
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const { before, after } = await saveSettings(db, parsed.data as Partial<Settings>, ctx.email);
  await audit(db, ctx, 'settings.update', 'settings', '', before, after);
}

// ───────────── Audit log ─────────────
export async function listAudit(db: Db, ctx: AdminCtx, f: { entity?: string; q?: string; page?: number }) {
  assertCan(ctx.role, 'audit.read');
  const conds = [];
  if (f.entity) conds.push(eq(auditLog.entity, f.entity));
  if (f.q?.trim()) { const like = `%${f.q.trim().replace(/[%_\\]/g, '\\$&')}%`; conds.push(or(ilike(auditLog.adminEmail, like), ilike(auditLog.action, like), ilike(auditLog.entityId, like))); }
  return db.select().from(auditLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLog.id)).limit(50).offset((Math.max(f.page ?? 1, 1) - 1) * 50);
}

// ───────────── Dashboard ─────────────
const IST = 'Asia/Kolkata';

export async function dashboard(db: Db, ctx: AdminCtx) {
  assertCan(ctx.role, 'reports.read');
  const counted = sql`status not in ('pending_payment','cancelled')`;
  const [sales, byStatus, attentionRefund, attentionReturns, mismatches, low, top, series] = await Promise.all([
    db.execute(sql`
      select
        coalesce(sum(total_paise) filter (where (created_at at time zone ${IST})::date = (now() at time zone ${IST})::date), 0)::bigint as today,
        count(*) filter (where (created_at at time zone ${IST})::date = (now() at time zone ${IST})::date)::int as today_orders,
        coalesce(sum(total_paise) filter (where created_at >= now() - interval '7 days'), 0)::bigint as week,
        coalesce(sum(total_paise) filter (where created_at >= now() - interval '30 days'), 0)::bigint as month,
        count(*) filter (where created_at >= now() - interval '30 days')::int as month_orders
      from orders where ${counted}`),
    db.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status),
    db.select({ id: orders.id, number: orders.number, total: orders.totalPaise }).from(orders).where(eq(orders.paymentStatus, 'refund_pending')).limit(20),
    db.select({ id: orders.id, number: orders.number }).from(orders).where(eq(orders.status, 'return_requested')).limit(20),
    db.select({ id: orderEvents.orderId, note: orderEvents.note }).from(orderEvents).where(sql`${orderEvents.note} like 'AMOUNT MISMATCH%'`).orderBy(desc(orderEvents.id)).limit(10),
    Promise.all([
      db.select({ id: sarees.id, name: sarees.name, stock: sarees.stock }).from(sarees).where(and(eq(sarees.status, 'active'), sql`${sarees.stock} <= ${sarees.lowStockThreshold}`)).orderBy(sarees.stock).limit(10),
      db.select({ id: ornaments.id, name: ornaments.name, stock: ornaments.stock }).from(ornaments).where(and(eq(ornaments.status, 'active'), sql`${ornaments.stock} <= ${ornaments.lowStockThreshold}`)).orderBy(ornaments.stock).limit(10),
    ]),
    db.execute(sql`
      select oi.product_id as id, oi.name, sum(oi.qty)::int as units, sum(oi.unit_price_paise * oi.qty - oi.discount_paise)::bigint as revenue
      from order_items oi join orders o on o.id = oi.order_id
      where oi.kind = 'saree' and o.status not in ('pending_payment','cancelled') and o.created_at >= now() - interval '30 days'
      group by oi.product_id, oi.name order by units desc limit 5`),
    db.execute(sql`
      select to_char(d, 'YYYY-MM-DD') as day,
        coalesce((select sum(total_paise) from orders o where status not in ('pending_payment','cancelled') and (o.created_at at time zone ${IST})::date = d), 0)::bigint as total
      from generate_series((now() at time zone ${IST})::date - 13, (now() at time zone ${IST})::date, interval '1 day') as d order by d`),
  ]);
  const s = rowsOf<Record<string, string | number>>(sales)[0] ?? {};
  const pendingMismatch = [];
  for (const m of mismatches) {
    const [o] = await db.select({ status: orders.status, paymentStatus: orders.paymentStatus, number: orders.number }).from(orders).where(eq(orders.id, m.id));
    if (o && o.paymentStatus !== 'paid' && o.paymentStatus !== 'refunded') pendingMismatch.push({ id: m.id, number: o.number, note: m.note });
  }
  return {
    todayPaise: Number(s.today ?? 0), todayOrders: Number(s.today_orders ?? 0), weekPaise: Number(s.week ?? 0), monthPaise: Number(s.month ?? 0), monthOrders: Number(s.month_orders ?? 0),
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Record<string, number>,
    refundPending: attentionRefund, returnRequests: attentionReturns, mismatches: pendingMismatch,
    lowStock: [...low[0].map((r) => ({ ...r, kind: 'saree' as const })), ...low[1].map((r) => ({ ...r, kind: 'ornament' as const }))],
    topSarees: rowsOf<{ id: string; name: string; units: number; revenue: string }>(top).map((r) => ({ ...r, revenue: Number(r.revenue) })),
    series: rowsOf<{ day: string; total: string }>(series).map((r) => ({ day: r.day, totalPaise: Number(r.total) })),
  };
}

