import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { orders, ornaments, payments, refunds, sarees, webhookEvents } from '@/db/schema';
import { createOrder, type CreateOrderInput } from '@/services/orders';
import { confirmClientPayment, handleRazorpayWebhook, markOrderPaid } from '@/services/payments';
import { refundOrder } from '@/services/refunds';
import { setRazorpayClient, type RazorpayClient, type RzpPayment } from '@/services/razorpay';
import { expireStaleOrders } from '@/services/orders';
import { freshDb } from './helpers';
import { makeCustomer, R, seedCatalogue, setSetting } from './fixtures';

let d: Db;
let me: Awaited<ReturnType<typeof makeCustomer>>;
let remote: Record<string, RzpPayment>;
let refundCalls: { paymentId: string; amountPaise: number; receipt: string }[];
let n = 0;

const fake: RazorpayClient = {
  async createOrder(p) { return { id: `order_X${++n}`, amount: p.amountPaise, currency: 'INR', receipt: p.receipt, status: 'created' }; },
  async fetchPayment(id) { const p = remote[id]; if (!p) throw new Error('no such payment'); return p; },
  async createRefund(p) { refundCalls.push(p); return { id: `rfnd_${refundCalls.length}`, payment_id: p.paymentId, amount: p.amountPaise, status: 'processed' }; },
};

const sign = (body: string, secret = 'whsec_test') => createHmac('sha256', secret).update(body).digest('hex');
const checkoutSig = (o: string, p: string) => createHmac('sha256', 'rzp_test_secret').update(`${o}|${p}`).digest('hex');

const input = (over: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  customer: me.customer, addressId: me.addressId, paymentMethod: 'online',
  looks: [{ sareeId: 'SA00007', ornamentIds: ['OR00001', 'OR00004'], qty: 1 }], ...over,
});
const status = async (id: string) => (await d.select().from(orders).where(eq(orders.id, id)))[0]!;
const stock = async (id: string) => (await d.select().from(sarees).where(eq(sarees.id, id)))[0]!.stock;

const webhook = (event: string, entity: Partial<RzpPayment> & { id: string }, eventId = `evt_${Math.random()}`) => {
  const body = JSON.stringify({ event, payload: { payment: { entity } } });
  return handleRazorpayWebhook(d, body, sign(body), eventId);
};

beforeEach(async () => {
  d = await freshDb();
  await seedCatalogue(d);
  me = await makeCustomer(d);
  remote = {}; refundCalls = [];
  setRazorpayClient(fake);
});

async function startOnline() {
  const r = await createOrder(d, input());
  return { orderId: r.order.id, rzOrder: r.payment!.razorpayOrderId, amount: r.order.totalPaise };
}

describe('browser callback', () => {
  it('marks the order paid only after verifying the signature AND fetching the payment', async () => {
    const o = await startOnline();
    remote.pay_1 = { id: 'pay_1', order_id: o.rzOrder, amount: o.amount, currency: 'INR', status: 'captured', method: 'upi' };
    const r = await confirmClientPayment(d, me.customer.id, { orderId: o.orderId, razorpayOrderId: o.rzOrder, razorpayPaymentId: 'pay_1', razorpaySignature: checkoutSig(o.rzOrder, 'pay_1') });
    expect(r.status).toBe('paid');
    const row = await status(o.orderId);
    expect([row.status, row.paymentStatus, row.reservedUntil]).toEqual(['placed', 'paid', null]);
  });

  it('rejects a forged signature without touching the order', async () => {
    const o = await startOnline();
    remote.pay_1 = { id: 'pay_1', order_id: o.rzOrder, amount: o.amount, currency: 'INR', status: 'captured' };
    await expect(confirmClientPayment(d, me.customer.id, { orderId: o.orderId, razorpayOrderId: o.rzOrder, razorpayPaymentId: 'pay_1', razorpaySignature: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'bad_request' });
    expect((await status(o.orderId)).status).toBe('pending_payment');
  });

  it('rejects a valid signature for a payment that belongs to a different Razorpay order', async () => {
    const o = await startOnline();
    remote.pay_1 = { id: 'pay_1', order_id: 'order_SOMEONE_ELSE', amount: o.amount, currency: 'INR', status: 'captured' };
    await expect(confirmClientPayment(d, me.customer.id, { orderId: o.orderId, razorpayOrderId: o.rzOrder, razorpayPaymentId: 'pay_1', razorpaySignature: checkoutSig(o.rzOrder, 'pay_1') })).rejects.toMatchObject({ code: 'bad_request' });
  });

  it("will not confirm someone else's order", async () => {
    const o = await startOnline();
    const other = await makeCustomer(d, '+919666666666');
    await expect(confirmClientPayment(d, other.customer.id, { orderId: o.orderId, razorpayOrderId: o.rzOrder, razorpayPaymentId: 'pay_1', razorpaySignature: checkoutSig(o.rzOrder, 'pay_1') })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('reports processing (not paid) when the payment is only authorised', async () => {
    const o = await startOnline();
    remote.pay_1 = { id: 'pay_1', order_id: o.rzOrder, amount: o.amount, currency: 'INR', status: 'authorized' };
    const r = await confirmClientPayment(d, me.customer.id, { orderId: o.orderId, razorpayOrderId: o.rzOrder, razorpayPaymentId: 'pay_1', razorpaySignature: checkoutSig(o.rzOrder, 'pay_1') });
    expect(r.status).toBe('processing');
    expect((await status(o.orderId)).status).toBe('pending_payment');
  });

  it('refuses to fulfil when the captured amount differs from the order total', async () => {
    const o = await startOnline();
    expect(await markOrderPaid(d, { razorpayOrderId: o.rzOrder, paymentId: 'pay_1', amountPaise: 100, source: 'webhook' })).toBe('amount_mismatch');
    expect((await status(o.orderId)).status).toBe('pending_payment');
  });
});

describe('webhooks', () => {
  it('rejects bad signatures', async () => {
    const body = JSON.stringify({ event: 'order.paid' });
    expect((await handleRazorpayWebhook(d, body, 'deadbeef', 'e1')).status).toBe(401);
    expect((await handleRazorpayWebhook(d, body, null, 'e1')).status).toBe(401);
    expect((await handleRazorpayWebhook(d, body, sign(body, 'wrong-secret'), 'e1')).status).toBe(401);
  });

  it('fulfils on payment.captured, once, even when delivered twice', async () => {
    const o = await startOnline();
    const ent = { id: 'pay_1', order_id: o.rzOrder, amount: o.amount, currency: 'INR', status: 'captured' as const, method: 'card' };
    expect((await webhook('payment.captured', ent, 'evt_A')).body).toBe('ok');
    expect((await webhook('payment.captured', ent, 'evt_A')).body).toBe('duplicate');
    expect((await status(o.orderId)).status).toBe('placed');
    expect(await d.select().from(payments).where(eq(payments.providerPaymentId, 'pay_1'))).toHaveLength(1);
  });

  it('a late "failed" event never undoes a captured payment', async () => {
    const o = await startOnline();
    await webhook('payment.captured', { id: 'pay_1', order_id: o.rzOrder, amount: o.amount, currency: 'INR', status: 'captured' });
    await webhook('payment.failed', { id: 'pay_1', order_id: o.rzOrder, amount: o.amount, currency: 'INR', status: 'failed' });
    expect((await status(o.orderId)).paymentStatus).toBe('paid');
    expect((await d.select().from(payments).where(eq(payments.providerPaymentId, 'pay_1')))[0]!.status).toBe('captured');
  });

  it('records a failed attempt and keeps the order open for a retry', async () => {
    const o = await startOnline();
    await webhook('payment.failed', { id: 'pay_f', order_id: o.rzOrder, amount: o.amount, currency: 'INR', status: 'failed', error_description: 'Card declined' });
    expect((await status(o.orderId)).status).toBe('pending_payment');
    expect((await d.select().from(payments).where(eq(payments.providerPaymentId, 'pay_f')))[0]!.status).toBe('failed');
  });

  it('acknowledges unknown events and malformed bodies safely', async () => {
    const body = JSON.stringify({ event: 'something.new', payload: {} });
    expect((await handleRazorpayWebhook(d, body, sign(body), 'e9')).status).toBe(200);
    const bad = 'not json';
    expect((await handleRazorpayWebhook(d, bad, sign(bad), 'e10')).status).toBe(400);
    expect(await d.select().from(webhookEvents).where(eq(webhookEvents.eventId, 'e9'))).toHaveLength(1);
  });
});

describe('late payment after the hold expired', () => {
  it('reinstates the order when stock is still available', async () => {
    const o = await startOnline();
    await d.update(orders).set({ reservedUntil: new Date(Date.now() - 20 * 60_000) }).where(eq(orders.id, o.orderId));
    await expireStaleOrders(d);
    expect((await status(o.orderId)).status).toBe('cancelled');
    expect(await stock('SA00007')).toBe(25);
    expect(await markOrderPaid(d, { razorpayOrderId: o.rzOrder, paymentId: 'pay_1', amountPaise: o.amount, source: 'webhook' })).toBe('reinstated');
    expect((await status(o.orderId)).status).toBe('placed');
    expect(await stock('SA00007')).toBe(24);
  });

  it('refunds in full when the stock has gone elsewhere', async () => {
    const o = await startOnline();
    await d.update(orders).set({ reservedUntil: new Date(Date.now() - 20 * 60_000) }).where(eq(orders.id, o.orderId));
    await expireStaleOrders(d);
    await d.update(sarees).set({ stock: 0 }).where(eq(sarees.id, 'SA00007'));
    expect(await markOrderPaid(d, { razorpayOrderId: o.rzOrder, paymentId: 'pay_1', amountPaise: o.amount, source: 'webhook' })).toBe('refunding');
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0]!.amountPaise).toBe(o.amount);
    expect((await status(o.orderId)).status).toBe('cancelled');
    expect(await stock('SA00007')).toBe(0); // untouched
  });
});

describe('refunds', () => {
  async function paidOrder() {
    const o = await startOnline();
    await markOrderPaid(d, { razorpayOrderId: o.rzOrder, paymentId: 'pay_1', amountPaise: o.amount, source: 'webhook' });
    return o;
  }

  it('supports partial refunds up to the paid amount, never beyond', async () => {
    const o = await paidOrder();
    await refundOrder(d, o.orderId, R(1000), 'goodwill', { type: 'admin', id: 'a1' });
    expect((await status(o.orderId)).paymentStatus).toBe('partially_refunded');
    await expect(refundOrder(d, o.orderId, o.amount, 'too much', { type: 'admin' })).rejects.toMatchObject({ code: 'bad_request' });
    await refundOrder(d, o.orderId, undefined, 'rest', { type: 'admin' });
    expect((await status(o.orderId)).paymentStatus).toBe('refunded');
    await expect(refundOrder(d, o.orderId, undefined, 'again', { type: 'admin' })).rejects.toMatchObject({ code: 'conflict' });
    expect(refundCalls.reduce((a, c) => a + c.amountPaise, 0)).toBe(o.amount);
  });

  it('refunds nothing on an unpaid order', async () => {
    const o = await startOnline();
    await expect(refundOrder(d, o.orderId, undefined, 'x', { type: 'admin' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('cancelling a paid online order refunds automatically', async () => {
    const o = await paidOrder();
    const { cancelByCustomer } = await import('@/services/orders');
    await cancelByCustomer(d, me.customer.id, o.orderId, 'changed mind');
    expect(refundCalls).toHaveLength(1);
    expect((await status(o.orderId)).paymentStatus).toBe('refunded');
    expect(await stock('SA00007')).toBe(25);
  });

  it('leaves the order refund_pending if Razorpay is down, never losing track of the money owed', async () => {
    const o = await paidOrder();
    setRazorpayClient({ ...fake, createRefund: async () => { throw new Error('boom'); } });
    await expect(refundOrder(d, o.orderId, undefined, 'x', { type: 'admin' })).rejects.toBeTruthy();
    const rows = await d.select().from(refunds).where(eq(refunds.orderId, o.orderId));
    expect(rows[0]!.status).toBe('failed');
    expect((await status(o.orderId)).paymentStatus).toBe('refund_pending');
    setRazorpayClient(fake);
    await refundOrder(d, o.orderId, undefined, 'retry', { type: 'admin' }); // can be retried
    expect((await status(o.orderId)).paymentStatus).toBe('refunded');
  });

  it('records COD refunds as manual', async () => {
    await setSetting(d, 'codLimitPaise', R(50_000));
    const r = await createOrder(d, input({ paymentMethod: 'cod' }));
    await d.update(orders).set({ paymentStatus: 'cod_collected', status: 'delivered' }).where(eq(orders.id, r.order.id));
    const out = await refundOrder(d, r.order.id, undefined, 'returned', { type: 'admin' });
    expect(out.status).toBe('manual');
    expect(refundCalls).toHaveLength(0);
    expect((await status(r.order.id)).paymentStatus).toBe('refunded');
  });
});

describe('stock is not double-counted by payment paths', () => {
  it('a normal paid order holds exactly one unit', async () => {
    const o = await startOnline();
    await markOrderPaid(d, { razorpayOrderId: o.rzOrder, paymentId: 'pay_1', amountPaise: o.amount, source: 'checkout' });
    await markOrderPaid(d, { razorpayOrderId: o.rzOrder, paymentId: 'pay_1', amountPaise: o.amount, source: 'webhook' });
    expect(await stock('SA00007')).toBe(24);
    expect((await d.select().from(ornaments).where(eq(ornaments.id, 'OR00001')))[0]!.stock).toBe(21);
  });
});
