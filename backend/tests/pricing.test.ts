import { describe, expect, it } from 'vitest';
import { allocate, effectivePrice, evaluatePromo, priceCart, PricingError, type CatalogueView, type OrnamentProduct, type PricedProduct } from '@/lib/pricing';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { R } from './fixtures';

const p = (id: string, name: string, mrp: number, disc = 0): PricedProduct => ({ id, name, mrpPaise: R(mrp), discountPercent: disc, discountStartsAt: null, discountEndsAt: null });
const o = (id: string, slot: string, mrp: number, disc = 0): OrnamentProduct => ({ ...p(id, id, mrp, disc), slot });

const catalogue: CatalogueView = {
  sarees: new Map([p('SA00001', 'Banarasi', 8999, 10), p('SA00006', 'Georgette', 3599, 20), p('SA00007', 'Kasavu', 2999)].map((x) => [x.id, x])),
  ornaments: new Map([
    o('OR00001', 'necklace', 2499), o('OR00003', 'necklace', 4999), o('OR00004', 'bangles', 1299), o('OR00006', 'bangles', 2199, 15),
    o('OR00007', 'earrings', 899), o('OR00009', 'earrings', 799), o('OR00014', 'anklet', 1499),
  ].map((x) => [x.id, x])),
};
const price = (looks: { sareeId: string; ornamentIds: string[]; qty?: number }[], extra: Partial<Parameters<typeof priceCart>[0]> = {}) =>
  priceCart({ looks: looks.map((l) => ({ qty: 1, ...l })), catalogue, settings: DEFAULT_SETTINGS, paymentMethod: 'online', ...extra });

describe('effective price', () => {
  it('matches the prices shown on the site', () => {
    const now = new Date();
    expect(effectivePrice(catalogue.sarees.get('SA00001')!, now)).toBe(R(8099));
    expect(effectivePrice(catalogue.sarees.get('SA00006')!, now)).toBe(R(2879));
    expect(effectivePrice(catalogue.ornaments.get('OR00006')!, now)).toBe(R(1869));
  });
  it('ignores a discount outside its window', () => {
    const exp = { ...p('X', 'x', 1000, 50), discountEndsAt: new Date(Date.now() - 1000) };
    const fut = { ...p('X', 'x', 1000, 50), discountStartsAt: new Date(Date.now() + 60_000) };
    expect(effectivePrice(exp, new Date())).toBe(R(1000));
    expect(effectivePrice(fut, new Date())).toBe(R(1000));
  });
});

describe('complete-the-look bundle', () => {
  it('reproduces the published look totals', () => {
    // Banarasi + Temple Kundan Necklace + Gold Plated Bangles + Kundan Studs = ₹12,236 on the live site
    const a = price([{ sareeId: 'SA00001', ornamentIds: ['OR00001', 'OR00004', 'OR00009'] }]);
    expect(a.totalPaise).toBe(R(12236));
    // Georgette + Polki Choker + Pearl Bangles + Kundan Studs = ₹9,779
    const b = price([{ sareeId: 'SA00006', ornamentIds: ['OR00003', 'OR00006', 'OR00009'] }]);
    expect(b.totalPaise).toBe(R(9779));
    // Kasavu + 4 pieces = ₹8,575
    const c = price([{ sareeId: 'SA00007', ornamentIds: ['OR00001', 'OR00004', 'OR00007', 'OR00014'] }]);
    expect(c.totalPaise).toBe(R(8575));
  });
  it('gives no bundle discount for a single ornament', () => {
    const r = price([{ sareeId: 'SA00007', ornamentIds: ['OR00001'] }]);
    expect(r.bundleDiscountPaise).toBe(0);
    expect(r.totalPaise).toBe(R(2999 + 2499));
  });
  it('allocates the bundle discount across lines with no drift', () => {
    const r = price([{ sareeId: 'SA00001', ornamentIds: ['OR00001', 'OR00004', 'OR00009'] }]);
    expect(r.lines.reduce((a, l) => a + l.discountPaise, 0)).toBe(r.bundleDiscountPaise);
  });
  it('scales by quantity', () => {
    const one = price([{ sareeId: 'SA00001', ornamentIds: ['OR00001', 'OR00004'] }]);
    const two = price([{ sareeId: 'SA00001', ornamentIds: ['OR00001', 'OR00004'], qty: 2 }]);
    expect(two.totalPaise).toBe(one.totalPaise * 2);
    expect(two.lines.reduce((a, l) => a + l.discountPaise, 0)).toBe(two.bundleDiscountPaise);
  });
  it('allocate() never loses a paisa', () => {
    for (let i = 0; i < 200; i++) {
      const w = Array.from({ length: 1 + (i % 6) }, (_, k) => 1 + ((i * 7 + k * 13) % 5000));
      const total = (i * 977) % 90_000;
      expect(allocate(total, w).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe('validation', () => {
  it('rejects unknown products, duplicate ornaments, bad quantities and empty bags', () => {
    expect(() => price([{ sareeId: 'NOPE', ornamentIds: [] }])).toThrow(PricingError);
    expect(() => price([{ sareeId: 'SA00001', ornamentIds: ['NOPE'] }])).toThrow(PricingError);
    expect(() => price([{ sareeId: 'SA00001', ornamentIds: ['OR00001', 'OR00001'] }])).toThrow(/twice/);
    expect(() => price([{ sareeId: 'SA00001', ornamentIds: [], qty: 0 }])).toThrow(/Quantity/);
    expect(() => price([{ sareeId: 'SA00001', ornamentIds: [], qty: 99 }])).toThrow(/Quantity/);
    expect(() => price([])).toThrow(/empty/);
  });
});

describe('promo codes', () => {
  const base = R(10000);
  it('applies a percentage with a cap', () => {
    const r = evaluatePromo({ code: 'A', kind: 'percent', value: 20, minSubtotalPaise: 0, maxDiscountPaise: R(1500) }, base);
    expect(r).toEqual({ ok: true, discountPaise: R(1500) });
  });
  it('enforces a minimum bag value', () => {
    const r = evaluatePromo({ code: 'A', kind: 'flat', value: R(500), minSubtotalPaise: R(12000), maxDiscountPaise: null }, base);
    expect(r.ok).toBe(false);
  });
  it('can never make an order free', () => {
    const r = evaluatePromo({ code: 'A', kind: 'flat', value: R(99999), minSubtotalPaise: 0, maxDiscountPaise: null }, base);
    expect(r).toEqual({ ok: true, discountPaise: base - 100 });
  });
  it('flows into the cart total', () => {
    const r = price([{ sareeId: 'SA00007', ornamentIds: [] }], { promo: { code: 'WELCOME', kind: 'flat', value: R(300), minSubtotalPaise: 0, maxDiscountPaise: null } });
    expect(r.totalPaise).toBe(R(2699));
    expect(r.promoCode).toBe('WELCOME');
  });
});

describe('shipping and Cash on Delivery', () => {
  it('blocks COD above the limit and when disabled', () => {
    expect(() => price([{ sareeId: 'SA00001', ornamentIds: [] }], { paymentMethod: 'cod', settings: { ...DEFAULT_SETTINGS, codLimitPaise: R(5000) } })).toThrow(/Cash on Delivery/);
    expect(() => price([{ sareeId: 'SA00007', ornamentIds: [] }], { paymentMethod: 'cod', settings: { ...DEFAULT_SETTINGS, codEnabled: false } })).toThrow(/not available/);
  });
  it('adds shipping unless over the free-shipping threshold, and the COD fee', () => {
    const s = { ...DEFAULT_SETTINGS, shippingFlatPaise: R(99), freeShippingOverPaise: R(5000), codFeePaise: R(40) };
    expect(price([{ sareeId: 'SA00007', ornamentIds: [] }], { settings: s }).totalPaise).toBe(R(2999 + 99));
    expect(price([{ sareeId: 'SA00001', ornamentIds: [] }], { settings: s }).shippingPaise).toBe(0);
    expect(price([{ sareeId: 'SA00007', ornamentIds: [] }], { settings: s, paymentMethod: 'cod' }).totalPaise).toBe(R(2999 + 99 + 40));
  });
});
