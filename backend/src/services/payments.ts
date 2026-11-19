import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { orderEvents, orderItems, orders, payments, webhookEvents } from '@/db/schema';
import { ApiError, badRequest, notFound } from '@/lib/errors';
import { notifyOrderPlaced } from './notify';
import { EXPIRED_REASON, reserveStock, type Actor } from './orders';
import { background } from '@/lib/background';
import { markRefundFromWebhook, refundOrder } from './refunds';
import { razorpay, verifyCheckoutSignature, verifyWebhookSignature, type RzpPayment } from './razorpay';

// Payment confirmation follows Razorpay's own guidance:
//   • the browser callback is only a hint: we verify its signature AND fetch the payment from Razorpay;
//   • the signed webhook is the source of truth;
//   • both paths end in the same idempotent function, which never moves an order backwards.

class StockShort extends Error {}

export type PaidOutcome = 'paid' | 'already_paid' | 'reinstated' | 'refunding' | 'amount_mismatch' | 'unknown_order';

export async function markOrderPaid(db: Db, p: {
  razorpayOrderId: string; paymentId: string; amountPaise: number; currency?: string; method?: string; source: 'checkout' | 'webhook';
}): Promise<PaidOutcome> {
  const actor: Actor = { type: 'razorpay' };
  let notifyId: string | undefined;
  let refundId: string | undefined;
  let duplicate: { orderId: string } | undefined;

  const outcome = await db.transaction(async (tx): Promise<PaidOutcome> => {
    const [o] = await tx.select().from(orders).where(eq(orders.razorpayOrderId, p.razorpayOrderId)).for('update');
    if (!o) return 'unknown_order';

    // Was this exact payment already recorded as captured? (A replayed webhook, or callback + webhook for one payment.)
    const prior = await tx.select({ id: payments.providerPaymentId, status: payments.status }).from(payments)
      .where(and(eq(payments.orderId, o.id), eq(payments.provider, 'razorpay'), inArray(payments.status, ['captured', 'refunded'])));
    const seenThis = prior.some((r) => r.id === p.paymentId);
    const otherCaptured = prior.some((r) => r.id !== p.paymentId);

    // Always record what Razorpay says happened, regardless of what we decide to do with the order.
    await tx.insert(payments).values({
      orderId: o.id, provider: 'razorpay', providerOrderId: p.razorpayOrderId, providerPaymentId: p.paymentId,
      amountPaise: p.amountPaise, status: 'captured', method: p.method ?? null,
    }).onConflictDoUpdate({ target: payments.providerPaymentId, set: { status: 'captured', method: p.method ?? null, updatedAt: new Date() } });

    if (p.amountPaise !== o.totalPaise || (p.currency ?? 'INR') !== 'INR') {
      // Never fulfil an order for the wrong amount. Surface it for a human (dashboard "needs attention").
      await tx.insert(orderEvents).values({ orderId: o.id, fromStatus: o.status, toStatus: o.status, actorType: 'razorpay', note: `AMOUNT MISMATCH: paid ${p.amountPaise}, expected ${o.totalPaise}. Payment ${p.paymentId} needs manual review` });
      return 'amount_mismatch';
    }
    if (o.paymentStatus === 'paid' || o.paymentStatus === 'refunded' || o.paymentStatus === 'partially_refunded' || o.paymentStatus === 'refund_pending') {
      // A different payment already settled this order: the customer was charged twice (two tabs, a retry after a slow
      // bank page). Give the extra one back. A replay of the same payment is simply acknowledged.
      if (!seenThis && otherCaptured) duplicate = { orderId: o.id };
      return 'already_paid';
    }

    if (o.status === 'pending_payment') {
      await tx.update(orders).set({ status: 'placed', paymentStatus: 'paid', reservedUntil: null, updatedAt: new Date() }).where(eq(orders.id, o.id));
      await tx.insert(orderEvents).values({ orderId: o.id, fromStatus: 'pending_payment', toStatus: 'placed', actorType: 'razorpay', note: `Payment received (${p.source})` });
      notifyId = o.id;
      return 'paid';
    }

    if (o.status === 'cancelled' && o.cancelReason !== EXPIRED_REASON) {
      // The customer or the team cancelled this order on purpose. Never revive it; give the money back.
      await tx.update(orders).set({ paymentStatus: 'refund_pending', updatedAt: new Date() }).where(eq(orders.id, o.id));
      await tx.insert(orderEvents).values({ orderId: o.id, fromStatus: 'cancelled', toStatus: 'cancelled', actorType: 'razorpay', note: 'Payment arrived for a cancelled order; refunding in full' });
      refundId = o.id;
      return 'refunding';
    }

    if (o.status === 'cancelled') {
      // Money arrived after our reservation expired and the stock was released. Try to take the stock back.
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
      try {
        await tx.transaction(async (sp) => {
          const r = await reserveStock(sp, o.id, items.map((i) => ({ kind: i.kind, productId: i.productId, name: i.name, qty: i.qty })), actor);
          if (!r.ok) throw new StockShort();
        });
        await tx.update(orders).set({ status: 'placed', paymentStatus: 'paid', reservedUntil: null, cancelledAt: null, cancelReason: null, updatedAt: new Date() }).where(eq(orders.id, o.id));
        await tx.insert(orderEvents).values({ orderId: o.id, fromStatus: 'cancelled', toStatus: 'placed', actorType: 'razorpay', note: 'Payment arrived after the hold expired; stock was still available, order reinstated' });
        notifyId = o.id;
        return 'reinstated';
      } catch (e) {
        if (!(e instanceof StockShort)) throw e;
        // refund_pending (not paid) keeps it on the dashboard if the automatic refund cannot be started.
        await tx.update(orders).set({ paymentStatus: 'refund_pending', updatedAt: new Date() }).where(eq(orders.id, o.id));
        await tx.insert(orderEvents).values({ orderId: o.id, fromStatus: 'cancelled', toStatus: 'cancelled', actorType: 'razorpay', note: 'Payment arrived after the hold expired and stock is gone; refunding in full' });
        refundId = o.id;
        return 'refunding';
      }
    }
    // Any other status already implies the payment was processed.
    await tx.update(orders).set({ paymentStatus: 'paid', updatedAt: new Date() }).where(eq(orders.id, o.id));
    return 'already_paid';
  });

  if (refundId) await refundOrder(db, refundId, undefined, 'Payment received for an order that was cancelled or could not be fulfilled', actor).catch((e) => console.error('[refund] late payment refund failed', e));
  if (duplicate) await refundDuplicate(db, duplicate.orderId, p.paymentId, p.amountPaise);
  if (notifyId) { const id = notifyId; background('notify', () => notifyOrderPlaced(db, id)); }
  return outcome;
}

/** A second captured payment on an already-paid order is returned in full, straight away, and kept out of the order's own refund maths. */
async function refundDuplicate(db: Db, orderId: string, paymentId: string, amountPaise: number) {
  try {
    await razorpay().createRefund({ paymentId, amountPaise, receipt: `dup-${paymentId}`.slice(0, 40), notes: { order_id: orderId, reason: 'duplicate payment' } });
    await db.update(payments).set({ status: 'refunded', updatedAt: new Date() }).where(eq(payments.providerPaymentId, paymentId));
    await db.insert(orderEvents).values({ orderId, toStatus: (await currentStatus(db, orderId)), actorType: 'razorpay', note: `Duplicate payment ${paymentId} refunded automatically` });
  } catch (e) {
    console.error('[refund] duplicate payment refund failed', paymentId, e);
    await db.insert(orderEvents).values({ orderId, toStatus: (await currentStatus(db, orderId)), actorType: 'razorpay', note: `ACTION NEEDED: duplicate payment ${paymentId} could not be refunded automatically. Refund it from the Razorpay dashboard` });
  }
}

async function currentStatus(db: Db, orderId: string) {
  const [o] = await db.select({ s: orders.status }).from(orders).where(eq(orders.id, orderId));
  return o?.s ?? 'placed';
}

async function recordFailure(db: Db, payment: RzpPayment) {
  if (!payment.order_id) return;
  const [o] = await db.select().from(orders).where(eq(orders.razorpayOrderId, payment.order_id));
  if (!o) return;
  const error = { code: payment.error_code ?? null, description: payment.error_description ?? null };
  await db.insert(payments).values({
    orderId: o.id, provider: 'razorpay', providerOrderId: payment.order_id, providerPaymentId: payment.id,
    amountPaise: payment.amount, status: 'failed', method: payment.method ?? null, error,
  }).onConflictDoUpdate({
    target: payments.providerPaymentId,
    // A failure event arriving after a capture (out of order) must not overwrite the capture.
    set: { status: 'failed', error, updatedAt: new Date() },
    setWhere: eq(payments.status, 'created'),
  });
  // The order stays open: the customer can retry on the same Razorpay order until the hold expires.
}

// ───────────────────────── Browser callback ─────────────────────────

export type ClientPaymentResult = { status: 'paid' | 'processing' };

export async function confirmClientPayment(db: Db, customerId: string, input: { orderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }): Promise<ClientPaymentResult> {
  const [o] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.customerId, customerId)));
  // Same message for "not yours" and "does not exist" so order ids cannot be probed.
  if (!o || o.razorpayOrderId !== input.razorpayOrderId) throw notFound('Order not found');

  if (!verifyCheckoutSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    throw badRequest('We could not verify this payment');
  }
  // Signature proves the ids belong together; fetching proves the money actually moved and for how much.
  const rz = await razorpay().fetchPayment(input.razorpayPaymentId);
  if (rz.order_id !== input.razorpayOrderId) throw badRequest('We could not verify this payment');
  if (rz.status === 'failed') throw new ApiError('payment_failed', 'The payment did not go through. You have not been charged');
  if (rz.status !== 'captured') return { status: 'processing' };

  const r = await markOrderPaid(db, { razorpayOrderId: rz.order_id, paymentId: rz.id, amountPaise: rz.amount, currency: rz.currency, method: rz.method, source: 'checkout' });
  if (r === 'amount_mismatch') throw new ApiError('payment_failed', 'We found a problem with this payment and our team has been alerted. Please contact care before paying again');
  if (r === 'refunding') throw new ApiError('out_of_stock', 'This order could not be completed (it was cancelled or an item sold out). Your money is being refunded in full');
  return { status: 'paid' };
}

// ───────────────────────── Webhook ─────────────────────────

type WebhookBody = {
  event: string;
  payload?: {
    payment?: { entity?: RzpPayment };
    order?: { entity?: { id: string } };
    refund?: { entity?: { id: string; status: string } };
  };
};

export type WebhookResult = { status: 200 | 400 | 401 | 500; body: string };

export async function handleRazorpayWebhook(db: Db, rawBody: string, signature: string | null, eventId: string | null): Promise<WebhookResult> {
  if (!verifyWebhookSignature(rawBody, signature)) return { status: 401, body: 'invalid signature' };

  let body: WebhookBody;
  try { body = JSON.parse(rawBody) as WebhookBody; } catch { return { status: 400, body: 'invalid json' }; }
  if (!body.event) return { status: 400, body: 'missing event' };

  // Razorpay retries and may deliver events more than once or out of order: dedupe on the event id.
  const id = eventId ?? `${body.event}:${body.payload?.payment?.entity?.id ?? body.payload?.refund?.entity?.id ?? body.payload?.order?.entity?.id ?? 'x'}`;
  const inserted = await db.insert(webhookEvents).values({ eventId: id, type: body.event, payload: body as never }).onConflictDoNothing().returning({ id: webhookEvents.eventId });
  if (inserted.length === 0) {
    const [prev] = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, id));
    if (prev?.processedAt) return { status: 200, body: 'duplicate' };
    // A previous attempt crashed before finishing: fall through and process again (handlers are idempotent).
  }

  try {
    const pay = body.payload?.payment?.entity;
    switch (body.event) {
      case 'order.paid':
      case 'payment.captured':
        if (pay?.order_id && pay.status === 'captured') {
          await markOrderPaid(db, { razorpayOrderId: pay.order_id, paymentId: pay.id, amountPaise: pay.amount, currency: pay.currency, method: pay.method, source: 'webhook' });
        }
        break;
      case 'payment.failed':
        if (pay) await recordFailure(db, pay);
        break;
      case 'refund.processed':
        if (body.payload?.refund?.entity?.id) await markRefundFromWebhook(db, body.payload.refund.entity.id, 'processed');
        break;
      case 'refund.failed':
        if (body.payload?.refund?.entity?.id) await markRefundFromWebhook(db, body.payload.refund.entity.id, 'failed');
        break;
      default:
        break; // subscribed-but-unused events are acknowledged and ignored
    }
    await db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.eventId, id));
    return { status: 200, body: 'ok' };
  } catch (e) {
    console.error('[webhook] processing failed', body.event, e);
    await db.update(webhookEvents).set({ error: e instanceof Error ? e.message.slice(0, 500) : 'error' }).where(eq(webhookEvents.eventId, id));
    return { status: 500, body: 'retry' }; // non-2xx makes Razorpay retry; handlers are idempotent
  }
}
