import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Db, Executor, Tx } from '@/db/client';
import {
  addresses, orderEvents, orderItems, orders, payments, promoCodes, promoRedemptions, returnRequests, stockMovements,
  type OrderAddress, type OrderStatus, type PaymentStatus, ornaments, sarees, refunds,
} from '@/db/schema';
import { ApiError, badRequest, conflict, notFound } from '@/lib/errors';
import { priceCart, PricingError, type LookInput, type PricedCart, type PromoRule } from '@/lib/pricing';
import { getSettings } from '@/lib/settings';
import { loadCatalogueForPricing } from './catalogue';
import { notifyOrderPlaced } from './notify';
import { razorpay } from './razorpay';
import { env } from '@/lib/env';
import { rowsOf } from '@/lib/sql-rows';
import { background } from '@/lib/background';

/** Reason recorded when the cron releases an unpaid order. Late payments may only revive orders cancelled for this reason. */
export const EXPIRED_REASON = 'Payment not completed in time';
const MAX_PENDING_ONLINE = 3;

export type Actor = { type: 'customer' | 'admin' | 'system' | 'razorpay'; id?: string };
const actorLabel = (a: Actor) => (a.id ? `${a.type}:${a.id}` : a.type);

// ───────────────────────── State machine ─────────────────────────

export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['placed', 'cancelled'],
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'], // returned = undelivered / return to origin
  delivered: ['return_requested', 'closed'],
  return_requested: ['returned', 'delivered'], // delivered = request rejected
  returned: ['closed'],
  cancelled: [],
  closed: [],
};

// pending_payment is included so a shopper can abandon a checkout; a payment that still lands afterwards is refunded, not revived.
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ['pending_payment', 'placed', 'confirmed', 'packed'];

export const canTransition = (from: OrderStatus, to: OrderStatus) => TRANSITIONS[from].includes(to);

// ───────────────────────── Stock ─────────────────────────

type StockLine = { kind: 'saree' | 'ornament'; productId: string; name: string; qty: number };

function aggregate(lines: StockLine[]): StockLine[] {
  const m = new Map<string, StockLine>();
  for (const l of lines) {
    const k = `${l.kind}:${l.productId}`;
    const cur = m.get(k);
    if (cur) cur.qty += l.qty;
    else m.set(k, { ...l });
  }
  // Fixed lock order prevents deadlocks between concurrent orders.
  return [...m.values()].sort((a, b) => (a.kind + a.productId).localeCompare(b.kind + b.productId));
}

/** Atomic `stock >= qty` guard: two shoppers can never both take the last piece. */
async function reserveStock(tx: Executor, orderId: string, lines: StockLine[], actor: Actor): Promise<{ ok: true } | { ok: false; short: string[] }> {
  const short: string[] = [];
  for (const l of aggregate(lines)) {
    const table = l.kind === 'saree' ? sarees : ornaments;
    const r = await tx.update(table).set({ stock: sql`${table.stock} - ${l.qty}`, updatedAt: new Date() })
      .where(and(eq(table.id, l.productId), sql`${table.stock} >= ${l.qty}`, eq(table.status, 'active')))
      .returning({ id: table.id });
    if (r.length === 0) { short.push(l.name); continue; }
    await tx.insert(stockMovements).values({ productKind: l.kind, productId: l.productId, delta: -l.qty, reason: 'order', orderId, actor: actorLabel(actor) });
  }
  return short.length ? { ok: false, short } : { ok: true };
}

async function releaseStock(tx: Executor, orderId: string, reason: 'cancel' | 'expire' | 'return', actor: Actor) {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const l of aggregate(items.map((i) => ({ kind: i.kind, productId: i.productId, name: i.name, qty: i.qty })))) {
    const table = l.kind === 'saree' ? sarees : ornaments;
    await tx.update(table).set({ stock: sql`${table.stock} + ${l.qty}`, updatedAt: new Date() }).where(eq(table.id, l.productId));
    await tx.insert(stockMovements).values({ productKind: l.kind, productId: l.productId, delta: l.qty, reason, orderId, actor: actorLabel(actor) });
  }
}

async function releasePromo(tx: Executor, orderId: string) {
  const del = await tx.delete(promoRedemptions).where(eq(promoRedemptions.orderId, orderId)).returning({ code: promoRedemptions.code });
  for (const r of del) await tx.update(promoCodes).set({ usedCount: sql`greatest(${promoCodes.usedCount} - 1, 0)` }).where(eq(promoCodes.code, r.code));
}

async function logEvent(tx: Executor, orderId: string, from: OrderStatus | null, to: OrderStatus, actor: Actor, note = '') {
  await tx.insert(orderEvents).values({ orderId, fromStatus: from, toStatus: to, actorType: actor.type, actorId: actor.id, note });
}

// ───────────────────────── Promo ─────────────────────────

async function loadPromo(tx: Executor, code: string | undefined, customerId: string): Promise<PromoRule | null> {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  const invalid = () => new ApiError('invalid_promo', 'That promo code is not valid');
  const [p] = await tx.select().from(promoCodes).where(eq(promoCodes.code, upper));
  const now = new Date();
  if (!p || !p.active || (p.startsAt && p.startsAt > now) || (p.endsAt && p.endsAt <= now)) throw invalid();
  if (p.usageLimit != null && p.usedCount >= p.usageLimit) throw new ApiError('invalid_promo', 'This promo code has been fully redeemed');
  const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(promoRedemptions)
    .where(and(eq(promoRedemptions.code, upper), eq(promoRedemptions.customerId, customerId)));
  if (n >= p.perCustomerLimit) throw new ApiError('invalid_promo', 'You have already used this promo code');
  return { code: p.code, kind: p.kind, value: p.value, minSubtotalPaise: p.minSubtotalPaise, maxDiscountPaise: p.maxDiscountPaise };
}

// ───────────────────────── Quote ─────────────────────────

function mapPricingError(e: unknown): never {
  if (e instanceof PricingError) {
    throw new ApiError(e.code === 'invalid_promo' ? 'invalid_promo' : e.code === 'unknown_product' ? 'not_found' : 'unprocessable', e.message);
  }
  throw e;
}

/** Prices a bag for display. Read-only; promo usage is checked but not consumed. */
export async function quote(db: Db, input: { looks: LookInput[]; paymentMethod: 'online' | 'cod'; promoCode?: string; customerId?: string }): Promise<PricedCart & { stockIssues: string[] }> {
  const settings = await getSettings(db);
  const catalogue = await loadCatalogueForPricing(db, input.looks.map((l) => l.sareeId), input.looks.flatMap((l) => l.ornamentIds));
  const promo = input.promoCode ? await loadPromo(db, input.promoCode, input.customerId ?? '00000000-0000-0000-0000-000000000000') : null;
  let cart: PricedCart;
  try { cart = priceCart({ looks: input.looks, catalogue, settings, promo, paymentMethod: input.paymentMethod }); } catch (e) { mapPricingError(e); }

  // Informational stock check so the bag can warn before checkout. The authoritative check is the atomic reservation.
  const need = aggregate(cart.lines.map((l) => ({ kind: l.kind, productId: l.productId, name: l.name, qty: l.qty })));
  const stockIssues: string[] = [];
  for (const n of need) {
    const table = n.kind === 'saree' ? sarees : ornaments;
    const [row] = await db.select({ stock: table.stock }).from(table).where(eq(table.id, n.productId));
    if (!row || row.stock < n.qty) stockIssues.push(n.name);
  }
  return { ...cart, stockIssues };
}

// ───────────────────────── Create order ─────────────────────────

export type CreateOrderInput = {
  customer: { id: string; phone: string; email: string | null };
  looks: LookInput[];
  paymentMethod: 'online' | 'cod';
  addressId: string;
  promoCode?: string;
  note?: string;
  idempotencyKey?: string;
};

export type CheckoutResult = {
  order: { id: string; number: string; status: OrderStatus; totalPaise: number; paymentMethod: 'online' | 'cod' };
  payment: null | { keyId: string; razorpayOrderId: string; amountPaise: number; currency: 'INR' };
  reused: boolean;
};

export async function createOrder(db: Db, input: CreateOrderInput): Promise<CheckoutResult> {
  const settings = await getSettings(db, { fresh: true });
  if (!settings.checkoutOpen) throw new ApiError('unprocessable', 'Orders are paused for a short while. Please try again soon');

  if (input.idempotencyKey) {
    const existing = await findByIdempotency(db, input.customer.id, input.idempotencyKey);
    if (existing) return existing;
  }

  const [addr] = await db.select().from(addresses)
    .where(and(eq(addresses.id, input.addressId), eq(addresses.customerId, input.customer.id), sql`${addresses.deletedAt} is null`));
  if (!addr) throw badRequest('Choose a delivery address');
  const snapshot: OrderAddress = { name: addr.name, phone: addr.phone, line1: addr.line1, line2: addr.line2, city: addr.city, state: addr.state, pincode: addr.pincode };

  const actor: Actor = { type: 'customer', id: input.customer.id };

  let created: { id: string; number: string; status: OrderStatus; totalPaise: number };
  try {
    created = await db.transaction(async (tx) => {
      // Serialise checkouts per customer: makes the per-customer promo limit and the pending-order cap race-free.
      await tx.execute(sql`select id from customers where id = ${input.customer.id} for update`);
      if (input.paymentMethod === 'online') {
        const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(orders)
          .where(and(eq(orders.customerId, input.customer.id), eq(orders.status, 'pending_payment')));
        // Unpaid orders hold stock; without a cap one account could lock up the whole catalogue.
        if (n >= MAX_PENDING_ONLINE) throw new ApiError('unprocessable', 'You have unpaid orders waiting. Complete or cancel one of them first, or wait 30 minutes');
      }
      const catalogue = await loadCatalogueForPricing(tx, input.looks.map((l) => l.sareeId), input.looks.flatMap((l) => l.ornamentIds));
      const promo = await loadPromo(tx, input.promoCode, input.customer.id);
      let cart: PricedCart;
      try { cart = priceCart({ looks: input.looks, catalogue, settings, promo, paymentMethod: input.paymentMethod }); } catch (e) { mapPricingError(e); }

      if (promo) {
        const claimed = await tx.update(promoCodes).set({ usedCount: sql`${promoCodes.usedCount} + 1` })
          .where(and(eq(promoCodes.code, promo.code), eq(promoCodes.active, true), sql`(${promoCodes.usageLimit} is null or ${promoCodes.usedCount} < ${promoCodes.usageLimit})`))
          .returning({ code: promoCodes.code });
        if (claimed.length === 0) throw new ApiError('invalid_promo', 'This promo code has been fully redeemed');
      }

      const [{ seq } = { seq: 0 }] = rowsOf<{ seq: number }>(await tx.execute(sql`select nextval('order_number_seq')::int as seq`));
      const number = `SD-${String(new Date().getFullYear()).slice(2)}-${String(seq).padStart(6, '0')}`;
      const online = input.paymentMethod === 'online';

      const [o] = await tx.insert(orders).values({
        number, customerId: input.customer.id,
        status: online ? 'pending_payment' : 'placed',
        paymentMethod: input.paymentMethod,
        paymentStatus: online ? 'unpaid' : 'cod_pending',
        mrpTotalPaise: cart.mrpTotalPaise, subtotalPaise: cart.subtotalPaise, bundleDiscountPaise: cart.bundleDiscountPaise,
        promoCode: cart.promoCode, promoDiscountPaise: cart.promoDiscountPaise,
        shippingPaise: cart.shippingPaise, codFeePaise: cart.codFeePaise, totalPaise: cart.totalPaise,
        address: snapshot, contactPhone: input.customer.phone, contactEmail: input.customer.email,
        reservedUntil: online ? new Date(Date.now() + settings.reservationMinutes * 60_000) : null,
        idempotencyKey: input.idempotencyKey ?? null,
        customerNote: (input.note ?? '').slice(0, 500),
      }).returning();
      if (!o) throw new Error('order insert failed');

      await tx.insert(orderItems).values(cart.lines.map((l) => ({
        orderId: o.id, lookIndex: l.lookIndex, kind: l.kind, productId: l.productId, name: l.name, slot: l.slot,
        mrpPaise: l.mrpPaise, unitPricePaise: l.unitPricePaise, qty: l.qty, discountPaise: l.discountPaise,
      })));

      const res = await reserveStock(tx, o.id, cart.lines.map((l) => ({ kind: l.kind, productId: l.productId, name: l.name, qty: l.qty })), actor);
      if (!res.ok) throw new ApiError('out_of_stock', `Sorry, ${res.short.join(', ')} just sold out or has too little stock left`, { items: res.short });

      if (promo) await tx.insert(promoRedemptions).values({ orderId: o.id, code: promo.code, customerId: input.customer.id });
      if (!online) await tx.insert(payments).values({ orderId: o.id, provider: 'cod', amountPaise: o.totalPaise, status: 'created', method: 'cod' });
      await logEvent(tx, o.id, null, o.status, actor, online ? 'Awaiting payment' : 'Cash on Delivery order placed');
      return { id: o.id, number: o.number, status: o.status, totalPaise: o.totalPaise };
    });
  } catch (e) {
    // Lost a race on the idempotency key: return the winner instead of failing.
    if (input.idempotencyKey && isUniqueViolation(e)) {
      const existing = await findByIdempotency(db, input.customer.id, input.idempotencyKey);
      if (existing) return existing;
    }
    throw e;
  }

  if (input.paymentMethod === 'cod') {
    background('notify', () => notifyOrderPlaced(db, created.id));
    return { order: { ...created, paymentMethod: 'cod' }, payment: null, reused: false };
  }

  // Online: create the Razorpay order OUTSIDE the transaction (no network call while holding row locks).
  try {
    const rz = await razorpay().createOrder({ amountPaise: created.totalPaise, receipt: created.number, notes: { order_id: created.id, number: created.number } });
    await db.transaction(async (tx) => {
      await tx.update(orders).set({ razorpayOrderId: rz.id, updatedAt: new Date() }).where(eq(orders.id, created.id));
      await tx.insert(payments).values({ orderId: created.id, provider: 'razorpay', providerOrderId: rz.id, amountPaise: created.totalPaise, status: 'created' });
    });
    return { order: { ...created, paymentMethod: 'online' }, payment: { keyId: env().RAZORPAY_KEY_ID ?? '', razorpayOrderId: rz.id, amountPaise: created.totalPaise, currency: 'INR' }, reused: false };
  } catch (e) {
    await cancelInternal(db, created.id, { type: 'system' }, 'Could not start payment', 'cancel').catch((err) => console.error('[orders] compensation failed', err));
    throw e;
  }
}

function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

async function findByIdempotency(db: Db, customerId: string, key: string): Promise<CheckoutResult | null> {
  const [o] = await db.select().from(orders).where(and(eq(orders.customerId, customerId), eq(orders.idempotencyKey, key)));
  if (!o) return null;
  const order = { id: o.id, number: o.number, status: o.status, totalPaise: o.totalPaise, paymentMethod: o.paymentMethod };
  const pending = o.status === 'pending_payment' && o.razorpayOrderId;
  return {
    order, reused: true,
    payment: pending ? { keyId: env().RAZORPAY_KEY_ID ?? '', razorpayOrderId: o.razorpayOrderId as string, amountPaise: o.totalPaise, currency: 'INR' } : null,
  };
}

// ───────────────────────── Transitions ─────────────────────────

export type TransitionOpts = { note?: string; carrier?: string; awb?: string; restock?: boolean };

/** Single choke point for every status change: validates the state machine, applies side effects, records history. */
export async function transitionOrder(db: Db, orderId: string, to: OrderStatus, actor: Actor, opts: TransitionOpts = {}) {
  if (to === 'cancelled') return cancelInternal(db, orderId, actor, opts.note ?? '', 'cancel');
  const result = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!o) throw notFound('Order not found');
    if (!canTransition(o.status, to)) throw conflict(`An order that is ${o.status.replace('_', ' ')} cannot be marked ${to.replace('_', ' ')}`);

    const patch: Partial<typeof orders.$inferInsert> = { status: to, updatedAt: new Date() };
    let paymentStatus: PaymentStatus | undefined;
    if (to === 'shipped') {
      if (!opts.carrier?.trim() || !opts.awb?.trim()) throw badRequest('Enter the courier and tracking number to mark this order shipped');
      patch.trackingCarrier = opts.carrier.trim().slice(0, 80);
      patch.trackingAwb = opts.awb.trim().slice(0, 80);
      patch.shippedAt = new Date();
    }
    if (to === 'delivered' && o.status === 'shipped') {
      patch.deliveredAt = new Date();
      if (o.paymentMethod === 'cod') paymentStatus = 'cod_collected';
    }
    if (to === 'returned') {
      if (opts.restock) await releaseStock(tx, o.id, 'return', actor);
      if (o.paymentStatus === 'paid' || o.paymentStatus === 'cod_collected') paymentStatus = 'refund_pending';
      if (o.status === 'return_requested') await tx.update(returnRequests).set({ status: 'received', resolvedAt: new Date() }).where(eq(returnRequests.orderId, o.id));
    }
    if (to === 'delivered' && o.status === 'return_requested') {
      await tx.update(returnRequests).set({ status: 'rejected', adminNote: opts.note ?? '', resolvedAt: new Date() }).where(eq(returnRequests.orderId, o.id));
    }
    if (paymentStatus) patch.paymentStatus = paymentStatus;
    await tx.update(orders).set(patch).where(eq(orders.id, o.id));
    await logEvent(tx, o.id, o.status, to, actor, opts.note ?? '');
    return { from: o.status };
  });
  return result;
}

async function cancelInternal(db: Db, orderId: string, actor: Actor, note: string, stockReason: 'cancel' | 'expire') {
  const out = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!o) throw notFound('Order not found');
    if (!canTransition(o.status, 'cancelled')) throw conflict(`This order is already ${o.status.replace('_', ' ')} and cannot be cancelled`);
    if (actor.type === 'customer' && !CUSTOMER_CANCELLABLE.includes(o.status)) throw conflict('This order can no longer be cancelled. Please request a return after delivery');

    await releaseStock(tx, o.id, stockReason, actor);
    await releasePromo(tx, o.id);
    const wasPaid = o.paymentStatus === 'paid';
    await tx.update(orders).set({
      status: 'cancelled', cancelledAt: new Date(), cancelReason: note.slice(0, 300), reservedUntil: null, updatedAt: new Date(),
      paymentStatus: wasPaid ? 'refund_pending' : o.paymentMethod === 'online' ? 'failed' : 'unpaid',
    }).where(eq(orders.id, o.id));
    await logEvent(tx, o.id, o.status, 'cancelled', actor, note);
    return { wasPaid, id: o.id };
  });
  if (out.wasPaid) {
    const { refundOrder } = await import('./refunds');
    await refundOrder(db, out.id, undefined, 'Order cancelled', { type: 'system' }).catch((e) => console.error('[refund] auto-refund failed, left as refund_pending', e));
  }
  return out;
}

export async function cancelByCustomer(db: Db, customerId: string, orderId: string, reason: string) {
  const [o] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)));
  if (!o) throw notFound('Order not found');
  return cancelInternal(db, orderId, { type: 'customer', id: customerId }, reason || 'Cancelled by customer', 'cancel');
}

export async function requestReturn(db: Db, customerId: string, orderId: string, reason: string) {
  const settings = await getSettings(db);
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, customerId))).for('update');
    if (!o) throw notFound('Order not found');
    if (o.status !== 'delivered' || !o.deliveredAt) throw conflict('Returns can be requested once an order has been delivered');
    const deadline = o.deliveredAt.getTime() + settings.returnWindowDays * 86_400_000;
    if (Date.now() > deadline) throw conflict(`The ${settings.returnWindowDays}-day return window for this order has ended. Please contact customer care`);
    const [existing] = await tx.select({ id: returnRequests.id }).from(returnRequests).where(eq(returnRequests.orderId, o.id));
    if (existing) throw conflict('A return has already been requested for this order');
    await tx.insert(returnRequests).values({ orderId: o.id, reason: reason.slice(0, 500) });
    await tx.update(orders).set({ status: 'return_requested', updatedAt: new Date() }).where(eq(orders.id, o.id));
    await logEvent(tx, o.id, 'delivered', 'return_requested', { type: 'customer', id: customerId }, reason.slice(0, 200));
    return { ok: true as const };
  });
}

// ───────────────────────── Reads ─────────────────────────

export async function getOrderDetail(db: Db, where: { id: string; customerId?: string }) {
  const [o] = await db.select().from(orders).where(where.customerId ? and(eq(orders.id, where.id), eq(orders.customerId, where.customerId)) : eq(orders.id, where.id));
  if (!o) return null;
  const [items, events, ret, pays, refs] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.lookIndex), asc(orderItems.id)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, o.id)).orderBy(asc(orderEvents.createdAt), asc(orderEvents.id)),
    db.select().from(returnRequests).where(eq(returnRequests.orderId, o.id)),
    db.select().from(payments).where(eq(payments.orderId, o.id)).orderBy(desc(payments.createdAt)),
    db.select().from(refunds).where(eq(refunds.orderId, o.id)).orderBy(desc(refunds.createdAt)),
  ]);
  return { order: o, items, events, returnRequest: ret[0] ?? null, payments: pays, refunds: refs };
}

/** What a customer is allowed to see. Internal notes, actor ids and raw provider data are excluded. */
export async function getCustomerOrder(db: Db, customerId: string, orderId: string) {
  const d = await getOrderDetail(db, { id: orderId, customerId });
  if (!d) throw notFound('Order not found');
  const { order: o } = d;
  return {
    id: o.id, number: o.number, status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    mrpTotalPaise: o.mrpTotalPaise, subtotalPaise: o.subtotalPaise, bundleDiscountPaise: o.bundleDiscountPaise,
    promoCode: o.promoCode, promoDiscountPaise: o.promoDiscountPaise, shippingPaise: o.shippingPaise, codFeePaise: o.codFeePaise, totalPaise: o.totalPaise,
    address: o.address, tracking: o.trackingAwb ? { carrier: o.trackingCarrier, awb: o.trackingAwb } : null,
    createdAt: o.createdAt, deliveredAt: o.deliveredAt,
    items: d.items.map((i) => ({ kind: i.kind, productId: i.productId, name: i.name, slot: i.slot, qty: i.qty, mrpPaise: i.mrpPaise, unitPricePaise: i.unitPricePaise, discountPaise: i.discountPaise, lookIndex: i.lookIndex })),
    timeline: d.events.filter((e) => e.toStatus !== 'pending_payment').map((e) => ({ status: e.toStatus, at: e.createdAt })),
    returnRequest: d.returnRequest ? { status: d.returnRequest.status, reason: d.returnRequest.reason } : null,
  };
}

export async function listCustomerOrders(db: Db, customerId: string, limit = 50) {
  const rows = await db.select().from(orders).where(and(eq(orders.customerId, customerId), sql`(${orders.status} <> 'pending_payment' or ${orders.reservedUntil} > now())`))
    .orderBy(desc(orders.createdAt)).limit(Math.min(limit, 100));
  if (rows.length === 0) return [];
  const items = await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((r) => r.id)));
  return rows.map((o) => ({
    id: o.id, number: o.number, status: o.status, paymentStatus: o.paymentStatus, totalPaise: o.totalPaise, createdAt: o.createdAt,
    itemCount: items.filter((i) => i.orderId === o.id).reduce((a, i) => a + i.qty, 0),
    sarees: items.filter((i) => i.orderId === o.id && i.kind === 'saree').map((i) => ({ productId: i.productId, name: i.name })),
  }));
}

// ───────────────────────── Maintenance (cron) ─────────────────────────

/** Releases stock held by unpaid online orders whose reservation ran out (with a grace period for slow webhooks). */
export async function expireStaleOrders(db: Db, graceMinutes = 5): Promise<number> {
  const cutoff = new Date(Date.now() - graceMinutes * 60_000);
  const stale = await db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.status, 'pending_payment'), lt(orders.reservedUntil, cutoff))).limit(100);
  let n = 0;
  for (const s of stale) {
    try { await cancelInternal(db, s.id, { type: 'system' }, EXPIRED_REASON, 'expire'); n++; } catch (e) {
      if (!(e instanceof ApiError)) console.error('[expire]', s.id, e);
    }
  }
  return n;
}

/** Delivered orders past the return window close automatically. */
export async function closeSettledOrders(db: Db): Promise<number> {
  const settings = await getSettings(db);
  const cutoff = new Date(Date.now() - settings.returnWindowDays * 86_400_000);
  const rows = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.status, 'delivered'), lt(orders.deliveredAt, cutoff))).limit(200);
  let n = 0;
  for (const r of rows) {
    try { await transitionOrder(db, r.id, 'closed', { type: 'system' }, { note: 'Return window ended' }); n++; } catch { /* raced with a return request */ }
  }
  return n;
}

export { reserveStock };
export type { Tx };
