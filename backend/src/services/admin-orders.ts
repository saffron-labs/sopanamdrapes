import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { customers, orders, ORDER_STATUSES, PAYMENT_STATUSES, returnRequests, type OrderStatus } from '@/db/schema';
import { audit, type AdminCtx } from '@/lib/audit';
import { badRequest, notFound } from '@/lib/errors';
import { assertCan } from '@/lib/rbac';
import { getOrderDetail, transitionOrder, type TransitionOpts } from './orders';
import { refundOrder } from './refunds';

export type OrderFilter = { status?: string; payment?: string; q?: string; page?: number; pageSize?: number };

function where(f: OrderFilter): SQL | undefined {
  const c: SQL[] = [];
  if (f.status === 'open') c.push(inArray(orders.status, ['placed', 'confirmed', 'packed']));
  else if (f.status && (ORDER_STATUSES as readonly string[]).includes(f.status)) c.push(eq(orders.status, f.status as OrderStatus));
  else c.push(sql`${orders.status} <> 'pending_payment'`); // abandoned checkouts are hidden unless asked for
  if (f.payment && (PAYMENT_STATUSES as readonly string[]).includes(f.payment)) c.push(eq(orders.paymentStatus, f.payment as 'paid'));
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    c.push(or(ilike(orders.number, like), ilike(orders.contactPhone, like), sql`${orders.address}->>'name' ilike ${like}`, ilike(orders.trackingAwb, like))!);
  }
  return and(...c);
}

export async function listOrders(db: Db, ctx: AdminCtx, f: OrderFilter) {
  assertCan(ctx.role, 'orders.read');
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  const w = where(f);
  const [rows, [{ n } = { n: 0 }]] = await Promise.all([
    db.select().from(orders).where(w).orderBy(desc(orders.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(orders).where(w),
  ]);
  return { rows, total: n, page, pageSize, pages: Math.max(1, Math.ceil(n / pageSize)) };
}

export async function adminOrder(db: Db, ctx: AdminCtx, id: string) {
  assertCan(ctx.role, 'orders.read');
  const d = await getOrderDetail(db, { id });
  if (!d) throw notFound('Order not found');
  const [customer] = await db.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email }).from(customers).where(eq(customers.id, d.order.customerId));
  return { ...d, customer };
}

export async function adminTransition(db: Db, ctx: AdminCtx, id: string, to: OrderStatus, opts: TransitionOpts = {}) {
  assertCan(ctx.role, 'orders.update');
  const [before] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, id));
  await transitionOrder(db, id, to, { type: 'admin', id: ctx.email }, opts);
  await audit(db, ctx, 'order.status', 'order', id, before, { status: to, ...opts });
}

export async function adminRefund(db: Db, ctx: AdminCtx, id: string, amountRupees: number | undefined, reason: string) {
  assertCan(ctx.role, 'orders.refund');
  if (!reason.trim()) throw badRequest('Add a reason for the refund');
  if (amountRupees !== undefined && (!Number.isFinite(amountRupees) || amountRupees <= 0)) throw badRequest('Enter a valid amount');
  const paise = amountRupees === undefined ? undefined : Math.round(amountRupees * 100);
  const r = await refundOrder(db, id, paise, reason.trim().slice(0, 300), { type: 'admin', id: ctx.email });
  await audit(db, ctx, 'order.refund', 'order', id, null, { amountPaise: paise ?? 'remaining', reason, status: r.status });
  return r;
}

export async function adminResolveReturn(db: Db, ctx: AdminCtx, id: string, decision: 'approve' | 'reject' | 'received', note: string, restock: boolean) {
  assertCan(ctx.role, 'orders.update');
  const [rr] = await db.select().from(returnRequests).where(eq(returnRequests.orderId, id));
  if (!rr) throw notFound('No return request on this order');
  if (decision === 'approve') {
    await db.update(returnRequests).set({ status: 'approved', adminNote: note.slice(0, 300) }).where(eq(returnRequests.orderId, id));
    await audit(db, ctx, 'return.approve', 'order', id, null, { note });
  } else if (decision === 'reject') {
    await adminTransition(db, ctx, id, 'delivered', { note: note || 'Return rejected' });
  } else {
    await adminTransition(db, ctx, id, 'returned', { note: note || 'Return received', restock });
  }
}

export async function adminSetNote(db: Db, ctx: AdminCtx, id: string, note: string) {
  assertCan(ctx.role, 'orders.update');
  const [before] = await db.select({ n: orders.adminNote }).from(orders).where(eq(orders.id, id));
  if (!before) throw notFound('Order not found');
  await db.update(orders).set({ adminNote: note.slice(0, 1000), updatedAt: new Date() }).where(eq(orders.id, id));
  await audit(db, ctx, 'order.note', 'order', id, { note: before.n }, { note });
}

/** Spreadsheet formula injection guard: a cell starting with = + - @ is executed by Excel/Sheets. */
export const csvCell = (v: unknown): string => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function exportOrdersCsv(db: Db, ctx: AdminCtx, f: OrderFilter): Promise<string> {
  assertCan(ctx.role, 'orders.export');
  const rows = await db.select().from(orders).where(where(f)).orderBy(desc(orders.createdAt)).limit(5000);
  const head = ['Order', 'Date', 'Status', 'Payment', 'Method', 'Total (INR)', 'Name', 'Phone', 'City', 'State', 'Pincode', 'Courier', 'AWB'];
  const body = rows.map((o) => [o.number, o.createdAt.toISOString(), o.status, o.paymentStatus, o.paymentMethod, (o.totalPaise / 100).toFixed(2), o.address.name, o.contactPhone, o.address.city, o.address.state, o.address.pincode, o.trackingCarrier ?? '', o.trackingAwb ?? ''].map(csvCell).join(','));
  await audit(db, ctx, 'order.export', 'order', '', null, { rows: rows.length, filter: f });
  return [head.map(csvCell).join(','), ...body].join('\r\n');
}
