import { and, eq, ne } from 'drizzle-orm';
import type { Db, Executor } from '@/db/client';
import { orders, payments, refunds } from '@/db/schema';
import { ApiError, badRequest, conflict, notFound } from '@/lib/errors';
import { razorpay } from './razorpay';
import type { Actor } from './orders';

const label = (a: Actor) => (a.id ? `${a.type}:${a.id}` : a.type);

/** Recomputes the order's payment status from its refund rows. */
export async function syncRefundStatus(ex: Executor, orderId: string) {
  const [o] = await ex.select().from(orders).where(eq(orders.id, orderId));
  if (!o) return;
  const rows = await ex.select().from(refunds).where(and(eq(refunds.orderId, orderId), ne(refunds.status, 'failed')));
  const done = rows.filter((r) => r.status === 'processed' || r.status === 'manual').reduce((a, r) => a + r.amountPaise, 0);
  const pending = rows.some((r) => r.status === 'initiated');
  let next = o.paymentStatus;
  if (done >= o.totalPaise) next = 'refunded';
  else if (pending) next = 'refund_pending';
  else if (done > 0) next = 'partially_refunded';
  if (next !== o.paymentStatus) await ex.update(orders).set({ paymentStatus: next, updatedAt: new Date() }).where(eq(orders.id, orderId));
}

/**
 * Refunds up to the amount still refundable. Online payments go back through Razorpay;
 * Cash on Delivery refunds are recorded as manual (bank transfer done by the team).
 * Omit `amountPaise` to refund everything that remains.
 */
export async function refundOrder(db: Db, orderId: string, amountPaise: number | undefined, reason: string, actor: Actor) {
  const prep = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!o) throw notFound('Order not found');
    if (!['paid', 'cod_collected', 'refund_pending', 'partially_refunded'].includes(o.paymentStatus)) {
      throw conflict('There is no collected payment on this order to refund');
    }
    const existing = await tx.select().from(refunds).where(and(eq(refunds.orderId, o.id), ne(refunds.status, 'failed')));
    const refunded = existing.reduce((a, r) => a + r.amountPaise, 0);
    const remaining = o.totalPaise - refunded;
    const amount = amountPaise ?? remaining;
    if (!Number.isInteger(amount) || amount <= 0) throw badRequest('There is nothing left to refund on this order');
    if (amount > remaining) throw badRequest(`Only ₹${(remaining / 100).toLocaleString('en-IN')} is still refundable on this order`);

    if (o.paymentMethod === 'cod') {
      const [r] = await tx.insert(refunds).values({ orderId: o.id, amountPaise: amount, status: 'manual', reason, createdBy: label(actor) }).returning();
      await syncRefundStatus(tx, o.id);
      return { kind: 'manual' as const, refundId: r?.id as string };
    }
    const [pay] = await tx.select().from(payments).where(and(eq(payments.orderId, o.id), eq(payments.provider, 'razorpay'), eq(payments.status, 'captured')));
    if (!pay?.providerPaymentId) throw conflict('No captured online payment was found for this order');
    const [r] = await tx.insert(refunds).values({ orderId: o.id, paymentId: pay.id, amountPaise: amount, status: 'initiated', reason, createdBy: label(actor) }).returning();
    await tx.update(orders).set({ paymentStatus: 'refund_pending', updatedAt: new Date() }).where(eq(orders.id, o.id));
    return { kind: 'online' as const, refundId: r?.id as string, providerPaymentId: pay.providerPaymentId, amount };
  });

  if (prep.kind === 'manual') return { refundId: prep.refundId, status: 'manual' as const };

  try {
    const rz = await razorpay().createRefund({
      paymentId: prep.providerPaymentId, amountPaise: prep.amount, receipt: prep.refundId,
      notes: { order_id: orderId, reason: reason.slice(0, 100) },
    });
    await db.transaction(async (tx) => {
      await tx.update(refunds).set({ providerRefundId: rz.id, status: rz.status === 'processed' ? 'processed' : 'initiated' }).where(eq(refunds.id, prep.refundId));
      await syncRefundStatus(tx, orderId);
    });
    return { refundId: prep.refundId, status: rz.status === 'processed' ? ('processed' as const) : ('initiated' as const) };
  } catch (e) {
    await db.transaction(async (tx) => {
      await tx.update(refunds).set({ status: 'failed' }).where(eq(refunds.id, prep.refundId));
      await syncRefundStatus(tx, orderId);
    });
    throw e instanceof ApiError ? e : new ApiError('payment_failed', 'The refund could not be started. Please try again');
  }
}

export async function markRefundFromWebhook(db: Db, providerRefundId: string, status: 'processed' | 'failed') {
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(refunds).where(eq(refunds.providerRefundId, providerRefundId)).for('update');
    if (!r) return;
    if (r.status === 'processed') return; // never move backwards
    await tx.update(refunds).set({ status }).where(eq(refunds.id, r.id));
    await syncRefundStatus(tx, r.orderId);
  });
}

