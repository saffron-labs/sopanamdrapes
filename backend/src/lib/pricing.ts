import { percentOfWholeRupees } from './money';
import type { Settings } from './settings';

// Pure pricing engine. Everything the customer is charged is computed here from database rows,
// never from numbers sent by the browser (OWASP: price manipulation).

export type PricedProduct = {
  id: string;
  name: string;
  mrpPaise: number;
  discountPercent: number;
  discountStartsAt: Date | null;
  discountEndsAt: Date | null;
};

export type OrnamentProduct = PricedProduct & { slot: string };

export type PromoRule = {
  code: string;
  kind: 'percent' | 'flat';
  value: number;
  minSubtotalPaise: number;
  maxDiscountPaise: number | null;
};

export type LookInput = { sareeId: string; ornamentIds: string[]; qty: number };

export type PricedLine = {
  lookIndex: number;
  kind: 'saree' | 'ornament';
  productId: string;
  name: string;
  slot: string | null;
  mrpPaise: number;
  unitPricePaise: number;
  qty: number;
  /** Bundle discount allocated to this whole line (already multiplied by qty). */
  discountPaise: number;
};

export type PricedCart = {
  lines: PricedLine[];
  mrpTotalPaise: number;
  subtotalPaise: number;
  bundleDiscountPaise: number;
  promoCode: string | null;
  promoDiscountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  totalPaise: number;
  savingsPaise: number;
};

export function effectivePrice(p: PricedProduct, now: Date): number {
  const active =
    p.discountPercent > 0 &&
    (!p.discountStartsAt || p.discountStartsAt <= now) &&
    (!p.discountEndsAt || p.discountEndsAt > now);
  return active ? p.mrpPaise - percentOfWholeRupees(p.mrpPaise, p.discountPercent) : p.mrpPaise;
}

/** Split `total` across weights with no rounding drift (largest remainder). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left--;
  }
  return floors;
}

export type PromoCheck = { ok: true; discountPaise: number } | { ok: false; reason: string };

export function evaluatePromo(rule: PromoRule, basePaise: number): PromoCheck {
  if (basePaise < rule.minSubtotalPaise) {
    return { ok: false, reason: `Add items worth ₹${Math.ceil((rule.minSubtotalPaise - basePaise) / 100).toLocaleString('en-IN')} more to use this code` };
  }
  let d = rule.kind === 'percent' ? percentOfWholeRupees(basePaise, rule.value) : rule.value;
  if (rule.maxDiscountPaise != null) d = Math.min(d, rule.maxDiscountPaise);
  d = Math.min(d, basePaise - 100); // an order is never free: online payments need at least ₹1
  if (d <= 0) return { ok: false, reason: 'This code does not apply to your bag' };
  return { ok: true, discountPaise: d };
}

export class PricingError extends Error {
  constructor(readonly code: 'unknown_product' | 'inactive_product' | 'invalid_look' | 'invalid_promo' | 'cod_unavailable', message: string) {
    super(message);
  }
}

export type CatalogueView = {
  sarees: Map<string, PricedProduct>;
  ornaments: Map<string, OrnamentProduct>;
};

export function priceCart(opts: {
  looks: LookInput[];
  catalogue: CatalogueView;
  settings: Settings;
  promo?: PromoRule | null;
  paymentMethod: 'online' | 'cod';
  now?: Date;
}): PricedCart {
  const { looks, catalogue, settings, promo, paymentMethod } = opts;
  const now = opts.now ?? new Date();
  if (looks.length === 0) throw new PricingError('invalid_look', 'Your bag is empty');

  const lines: PricedLine[] = [];
  let mrpTotal = 0, subtotal = 0, bundleTotal = 0;

  looks.forEach((look, lookIndex) => {
    const saree = catalogue.sarees.get(look.sareeId);
    if (!saree) throw new PricingError('unknown_product', `Saree ${look.sareeId} is not available`);
    if (!Number.isInteger(look.qty) || look.qty < 1 || look.qty > settings.maxQtyPerLook) {
      throw new PricingError('invalid_look', `Quantity must be between 1 and ${settings.maxQtyPerLook}`);
    }
    if (new Set(look.ornamentIds).size !== look.ornamentIds.length) {
      throw new PricingError('invalid_look', 'The same ornament was added twice to one look');
    }

    const sareePrice = effectivePrice(saree, now);
    lines.push({
      lookIndex, kind: 'saree', productId: saree.id, name: saree.name, slot: null,
      mrpPaise: saree.mrpPaise, unitPricePaise: sareePrice, qty: look.qty, discountPaise: 0,
    });
    mrpTotal += saree.mrpPaise * look.qty;
    subtotal += sareePrice * look.qty;

    const orns = look.ornamentIds.map((id) => {
      const o = catalogue.ornaments.get(id);
      if (!o) throw new PricingError('unknown_product', `Ornament ${id} is not available`);
      return o;
    });
    const prices = orns.map((o) => effectivePrice(o, now));
    const ornSubtotal = prices.reduce((a, b) => a + b, 0);
    const bundleEligible = settings.bundlePercent > 0 && orns.length >= settings.bundleMinPieces;
    const bundlePerLook = bundleEligible ? percentOfWholeRupees(ornSubtotal, settings.bundlePercent) : 0;
    const alloc = allocate(bundlePerLook, prices);

    orns.forEach((o, i) => {
      const unit = prices[i] ?? 0;
      lines.push({
        lookIndex, kind: 'ornament', productId: o.id, name: o.name, slot: o.slot,
        mrpPaise: o.mrpPaise, unitPricePaise: unit, qty: look.qty, discountPaise: (alloc[i] ?? 0) * look.qty,
      });
      mrpTotal += o.mrpPaise * look.qty;
      subtotal += unit * look.qty;
    });
    bundleTotal += bundlePerLook * look.qty;
  });

  const afterBundle = subtotal - bundleTotal;
  let promoDiscount = 0;
  let promoCode: string | null = null;
  if (promo) {
    const r = evaluatePromo(promo, afterBundle);
    if (!r.ok) throw new PricingError('invalid_promo', r.reason);
    promoDiscount = r.discountPaise;
    promoCode = promo.code;
  }

  const merchandise = afterBundle - promoDiscount;
  const freeShip = settings.freeShippingOverPaise > 0 && merchandise >= settings.freeShippingOverPaise;
  const shipping = freeShip ? 0 : settings.shippingFlatPaise;
  const codFee = paymentMethod === 'cod' ? settings.codFeePaise : 0;
  const total = merchandise + shipping + codFee;

  if (paymentMethod === 'cod') {
    if (!settings.codEnabled) throw new PricingError('cod_unavailable', 'Cash on Delivery is not available right now');
    if (total > settings.codLimitPaise) {
      throw new PricingError('cod_unavailable', `Cash on Delivery is available up to ₹${(settings.codLimitPaise / 100).toLocaleString('en-IN')}. Please pay online for this order`);
    }
  }

  return {
    lines, mrpTotalPaise: mrpTotal, subtotalPaise: subtotal, bundleDiscountPaise: bundleTotal,
    promoCode, promoDiscountPaise: promoDiscount, shippingPaise: shipping, codFeePaise: codFee, totalPaise: total,
    savingsPaise: mrpTotal - merchandise,
  };
}
