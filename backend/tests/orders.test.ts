import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { orderEvents, orders, ornaments, promoCodes, sarees, stockMovements } from '@/db/schema';
import { ApiError } from '@/lib/errors';
import { cancelByCustomer, closeSettledOrders, createOrder, expireStaleOrders, getCustomerOrder, quote, requestReturn, transitionOrder, type CreateOrderInput } from '@/services/orders';
import { setRazorpayClient, type RazorpayClient } from '@/services/razorpay';
import { freshDb } from './helpers';
import { makeCustomer, R, seedCatalogue, setSetting } from './fixtures';

let d: Db;
let me: Awaited<ReturnType<typeof makeCustomer>>;
let rzpCalls: { amountPaise: number; receipt: string }[];

const fakeRzp: RazorpayClient = {
  async createOrder(p) { rzpCalls.push({ amountPaise: p.amountPaise, receipt: p.receipt }); return { id: `order_${rzpCalls.length}_${p.receipt}`, amount: p.amountPaise, currency: 'INR', receipt: p.receipt, status: 'created' }; },
  async fetchPayment() { throw new Error('not used'); },
  async createRefund() { throw new Error('not used'); },
};

const input = (over: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  customer: me.customer, addressId: me.addressId, paymentMethod: 'cod',
  looks: [{ sareeId: 'SA00007', ornamentIds: ['OR00001', 'OR00004'], qty: 1 }], ...over,
});
const stock = async (table: typeof sarees | typeof ornaments, id: string) => (await d.select().from(table).where(eq(table.id, id)))[0]!.stock;

beforeEach(async () => {
  d = await freshDb();
  await seedCatalogue(d);
  me = await makeCustomer(d);
  await setSetting(d, 'codLimitPaise', R(50_000));
  rzpCalls = [];
  setRazorpayClient(fakeRzp);
});

describe('creating orders', () => {
  it('places a COD order, snapshots prices and reserves stock', async () => {
    const r = await createOrder(d, input());
    expect(r.order.status).toBe('placed');
    expect(r.payment).toBeNull();
    // 2999 + (2499+1299) - 10% of 3798 (380) = 6417
    expect(r.order.totalPaise).toBe(R(6417));
    expect(await stock(sarees, 'SA00007')).toBe(24);
    expect(await stock(ornaments, 'OR00001')).toBe(21);
    const [o] = await d.select().from(orders).where(eq(orders.id, r.order.id));
    expect(o!.paymentStatus).toBe('cod_pending');
    expect(o!.number).toMatch(/^SD-\d\d-\d{6}$/);
  });

  it('starts an online order as pending_payment with a Razorpay order for the server-computed amount', async () => {
    const r = await createOrder(d, input({ paymentMethod: 'online' }));
    expect(r.order.status).toBe('pending_payment');
    expect(r.payment?.amountPaise).toBe(R(6417));
    expect(rzpCalls).toEqual([{ amountPaise: R(6417), receipt: r.order.number }]);
    const [o] = await d.select().from(orders).where(eq(orders.id, r.order.id));
    expect(o!.reservedUntil).not.toBeNull();
    expect(o!.razorpayOrderId).toBe(r.payment!.razorpayOrderId);
  });

  it('never lets two shoppers buy the last piece', async () => {
    const other = await makeCustomer(d, '+919123456780');
    const a = await createOrder(d, input({ looks: [{ sareeId: 'SA00099', ornamentIds: [], qty: 1 }] }));
    expect(a.order.status).toBe('placed');
    await expect(createOrder(d, { ...input({ looks: [{ sareeId: 'SA00099', ornamentIds: [], qty: 1 }] }), customer: other.customer, addressId: other.addressId }))
      .rejects.toMatchObject({ code: 'out_of_stock' });
    expect(await stock(sarees, 'SA00099')).toBe(0);
  });

  it('handles simultaneous attempts on the last piece: exactly one wins', async () => {
    const others = await Promise.all([makeCustomer(d, '+919111111111'), makeCustomer(d, '+919222222222'), makeCustomer(d, '+919333333333')]);
    const results = await Promise.allSettled(others.map((c) => createOrder(d, { customer: c.customer, addressId: c.addressId, paymentMethod: 'cod', looks: [{ sareeId: 'SA00099', ornamentIds: [], qty: 1 }] })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stock(sarees, 'SA00099')).toBe(0);
  });

  it('rolls everything back when any item in the bag is short', async () => {
    await d.update(ornaments).set({ stock: 0 }).where(eq(ornaments.id, 'OR00004'));
    await expect(createOrder(d, input())).rejects.toMatchObject({ code: 'out_of_stock' });
    expect(await stock(sarees, 'SA00007')).toBe(25); // saree was NOT left decremented
    expect(await d.select().from(orders)).toHaveLength(0);
  });

  it('is idempotent: retrying with the same key returns the same order and reserves stock once', async () => {
    const a = await createOrder(d, input({ idempotencyKey: 'key-1', paymentMethod: 'online' }));
    const b = await createOrder(d, input({ idempotencyKey: 'key-1', paymentMethod: 'online' }));
    expect(b.reused).toBe(true);
    expect(b.order.id).toBe(a.order.id);
    expect(b.payment?.razorpayOrderId).toBe(a.payment?.razorpayOrderId);
    expect(await stock(sarees, 'SA00007')).toBe(24);
    expect(rzpCalls).toHaveLength(1);
  });

  it('refuses draft products, unknown products and addresses that belong to someone else', async () => {
    await expect(createOrder(d, input({ looks: [{ sareeId: 'SA00098', ornamentIds: [], qty: 1 }] }))).rejects.toBeInstanceOf(ApiError);
    await expect(createOrder(d, input({ looks: [{ sareeId: 'SA00007', ornamentIds: ['OR00098'], qty: 1 }] }))).rejects.toBeInstanceOf(ApiError);
    const stranger = await makeCustomer(d, '+919444444444');
    await expect(createOrder(d, input({ addressId: stranger.addressId }))).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('honours the checkout kill switch', async () => {
    await setSetting(d, 'checkoutOpen', false);
    await expect(createOrder(d, input())).rejects.toMatchObject({ code: 'unprocessable' });
  });

  it('cancels and releases stock if the payment provider is down', async () => {
    setRazorpayClient({ ...fakeRzp, createOrder: async () => { throw new ApiError('payment_failed', 'down'); } });
    await expect(createOrder(d, input({ paymentMethod: 'online' }))).rejects.toMatchObject({ code: 'payment_failed' });
    expect(await stock(sarees, 'SA00007')).toBe(25);
    expect((await d.select().from(orders))[0]!.status).toBe('cancelled');
  });

  it('records every stock change in the ledger', async () => {
    const r = await createOrder(d, input());
    await cancelByCustomer(d, me.customer.id, r.order.id, 'changed my mind');
    const ledger = await d.select().from(stockMovements).where(eq(stockMovements.productId, 'SA00007'));
    expect(ledger.map((l) => [l.delta, l.reason])).toEqual([[-1, 'order'], [1, 'cancel']]);
  });
});

describe('promo codes', () => {
  beforeEach(async () => {
    await d.insert(promoCodes).values({ code: 'WELCOME', kind: 'flat', value: R(300), usageLimit: 1, perCustomerLimit: 1 });
  });
  it('applies, counts, and releases on cancellation', async () => {
    const r = await createOrder(d, input({ promoCode: 'welcome' }));
    expect(r.order.totalPaise).toBe(R(6417 - 300));
    expect((await d.select().from(promoCodes))[0]!.usedCount).toBe(1);
    await cancelByCustomer(d, me.customer.id, r.order.id, '');
    expect((await d.select().from(promoCodes))[0]!.usedCount).toBe(0);
  });
  it('enforces the usage limit and per-customer limit', async () => {
    await createOrder(d, input({ promoCode: 'WELCOME' }));
    await expect(createOrder(d, input({ promoCode: 'WELCOME' }))).rejects.toMatchObject({ code: 'invalid_promo' });
    await expect(createOrder(d, input({ promoCode: 'NOPE' }))).rejects.toMatchObject({ code: 'invalid_promo' });
  });
  it('quote() prices without consuming the code', async () => {
    const q = await quote(d, { looks: input().looks, paymentMethod: 'online', promoCode: 'WELCOME', customerId: me.customer.id });
    expect(q.promoDiscountPaise).toBe(R(300));
    expect((await d.select().from(promoCodes))[0]!.usedCount).toBe(0);
  });
});

describe('order lifecycle', () => {
  it('walks the full happy path and collects COD on delivery', async () => {
    const { order } = await createOrder(d, input());
    const admin = { type: 'admin' as const, id: 'a1' };
    await transitionOrder(d, order.id, 'confirmed', admin);
    await transitionOrder(d, order.id, 'packed', admin);
    await expect(transitionOrder(d, order.id, 'shipped', admin)).rejects.toMatchObject({ code: 'bad_request' }); // needs AWB
    await transitionOrder(d, order.id, 'shipped', admin, { carrier: 'Delhivery', awb: 'DL123' });
    await transitionOrder(d, order.id, 'delivered', admin);
    const [o] = await d.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe('delivered');
    expect(o!.paymentStatus).toBe('cod_collected');
    const events = await d.select().from(orderEvents).where(eq(orderEvents.orderId, order.id));
    expect(events.map((e) => e.toStatus)).toEqual(['placed', 'confirmed', 'packed', 'shipped', 'delivered']);
  });

  it('rejects impossible jumps', async () => {
    const { order } = await createOrder(d, input());
    await expect(transitionOrder(d, order.id, 'delivered', { type: 'admin' })).rejects.toMatchObject({ code: 'conflict' });
    await expect(transitionOrder(d, order.id, 'closed', { type: 'admin' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('lets customers cancel until packed, but not after shipping', async () => {
    const a = await createOrder(d, input());
    await transitionOrder(d, a.order.id, 'confirmed', { type: 'admin' });
    await cancelByCustomer(d, me.customer.id, a.order.id, 'x');
    expect(await stock(sarees, 'SA00007')).toBe(25);

    const b = await createOrder(d, input());
    for (const s of ['confirmed', 'packed'] as const) await transitionOrder(d, b.order.id, s, { type: 'admin' });
    await transitionOrder(d, b.order.id, 'shipped', { type: 'admin' }, { carrier: 'X', awb: '1' });
    await expect(cancelByCustomer(d, me.customer.id, b.order.id, 'x')).rejects.toMatchObject({ code: 'conflict' });
  });

  it("hides other customers' orders (404, not 403)", async () => {
    const { order } = await createOrder(d, input());
    const stranger = await makeCustomer(d, '+919555555555');
    await expect(getCustomerOrder(d, stranger.customer.id, order.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(cancelByCustomer(d, stranger.customer.id, order.id, '')).rejects.toMatchObject({ code: 'not_found' });
    await expect(requestReturn(d, stranger.customer.id, order.id, '')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('customer view never exposes internal notes', async () => {
    const { order } = await createOrder(d, input());
    await d.update(orders).set({ adminNote: 'VIP, handle with care' }).where(eq(orders.id, order.id));
    const view = await getCustomerOrder(d, me.customer.id, order.id);
    expect(JSON.stringify(view)).not.toContain('VIP');
  });

  it('returns: only after delivery, within the window, once', async () => {
    const { order } = await createOrder(d, input());
    await expect(requestReturn(d, me.customer.id, order.id, 'wrong size')).rejects.toMatchObject({ code: 'conflict' });
    for (const s of ['confirmed', 'packed'] as const) await transitionOrder(d, order.id, s, { type: 'admin' });
    await transitionOrder(d, order.id, 'shipped', { type: 'admin' }, { carrier: 'X', awb: '1' });
    await transitionOrder(d, order.id, 'delivered', { type: 'admin' });
    await requestReturn(d, me.customer.id, order.id, 'wrong size');
    await expect(requestReturn(d, me.customer.id, order.id, 'again')).rejects.toMatchObject({ code: 'conflict' });
    expect((await d.select().from(orders))[0]!.status).toBe('return_requested');

    const { order: late } = await createOrder(d, input());
    for (const s of ['confirmed', 'packed'] as const) await transitionOrder(d, late.id, s, { type: 'admin' });
    await transitionOrder(d, late.id, 'shipped', { type: 'admin' }, { carrier: 'X', awb: '2' });
    await transitionOrder(d, late.id, 'delivered', { type: 'admin' });
    await d.update(orders).set({ deliveredAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(orders.id, late.id));
    await expect(requestReturn(d, me.customer.id, late.id, 'late')).rejects.toMatchObject({ code: 'conflict' });
    expect(await closeSettledOrders(d)).toBe(1);
  });
});

describe('maintenance', () => {
  it('expires unpaid online orders after the hold and returns the stock', async () => {
    const { order } = await createOrder(d, input({ paymentMethod: 'online' }));
    expect(await expireStaleOrders(d)).toBe(0); // still within the hold
    await d.update(orders).set({ reservedUntil: new Date(Date.now() - 10 * 60_000) }).where(eq(orders.id, order.id));
    expect(await expireStaleOrders(d)).toBe(1);
    expect(await stock(sarees, 'SA00007')).toBe(25);
    expect((await d.select().from(orders))[0]!.status).toBe('cancelled');
    expect(await expireStaleOrders(d)).toBe(0);
  });
});

describe('audit fixes', () => {
  it('caps unpaid online orders per customer so one account cannot hold the whole catalogue', async () => {
    const d = await freshDb(); await seedCatalogue(d);
    let k = 0;
    setRazorpayClient({ createOrder: async (p) => ({ id: `order_C${++k}`, amount: p.amountPaise, currency: 'INR', receipt: p.receipt, status: 'created' }), fetchPayment: async () => { throw new Error('x'); }, createRefund: async () => { throw new Error('x'); } });
    const me = await makeCustomer(d);
    const mk = () => createOrder(d, { customer: me.customer, addressId: me.addressId, paymentMethod: 'online', looks: [{ sareeId: 'SA00007', ornamentIds: [], qty: 1 }] });
    await mk(); await mk(); await mk();
    await expect(mk()).rejects.toThrow(/unpaid orders/);
  });
});
