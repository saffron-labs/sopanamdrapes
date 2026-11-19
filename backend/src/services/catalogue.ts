import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '@/db/client';
import { defaultLooks, ornaments, sarees } from '@/db/schema';
import { effectivePrice, type CatalogueView } from '@/lib/pricing';
import { getSettings } from '@/lib/settings';

type Row = typeof sarees.$inferSelect;
type OrnRow = typeof ornaments.$inferSelect;

function stockView(stock: number, threshold: number) {
  // Exact stock is business-sensitive; show availability and an urgency hint only when genuinely low.
  return { inStock: stock > 0, lowStock: stock > 0 && stock <= threshold, left: stock > 0 && stock <= threshold ? stock : null };
}

function priceView(p: { mrpPaise: number; discountPercent: number; discountStartsAt: Date | null; discountEndsAt: Date | null; id: string; name: string }, now: Date) {
  const price = effectivePrice(p, now);
  return { mrpPaise: p.mrpPaise, pricePaise: price, discountPercent: price < p.mrpPaise ? Math.round(((p.mrpPaise - price) / p.mrpPaise) * 100) : 0 };
}

export const publicSaree = (r: Row, now = new Date()) => ({
  id: r.id, name: r.name, colour: r.colour, fabric: r.fabric, description: r.description, highlights: r.highlights,
  blouseType: r.blouseType, worlds: r.worlds, tags: r.tags, images: r.images, specs: r.specs,
  ...priceView(r, now), ...stockView(r.stock, r.lowStockThreshold),
});

export const publicOrnament = (r: OrnRow, now = new Date()) => ({
  id: r.id, slot: r.slot, name: r.name, description: r.description, highlights: r.highlights, material: r.material,
  images: r.images, specs: r.specs, ...priceView(r, now), ...stockView(r.stock, r.lowStockThreshold),
});

export async function getPublicCatalogue(ex: Executor) {
  const now = new Date();
  const [sRows, oRows, looks, s] = await Promise.all([
    ex.select().from(sarees).where(eq(sarees.status, 'active')).orderBy(asc(sarees.position), asc(sarees.id)),
    ex.select().from(ornaments).where(eq(ornaments.status, 'active')).orderBy(asc(ornaments.position), asc(ornaments.id)),
    ex.select().from(defaultLooks),
    getSettings(ex),
  ]);
  const activeOrn = new Set(oRows.map((o) => o.id));
  const defaults: Record<string, string[]> = {};
  for (const l of looks) if (activeOrn.has(l.ornamentId)) (defaults[l.sareeId] ??= []).push(l.ornamentId);
  return {
    sarees: sRows.map((r) => publicSaree(r, now)),
    ornaments: oRows.map((r) => publicOrnament(r, now)),
    defaultLooks: defaults,
    rules: { bundlePercent: s.bundlePercent, bundleMinPieces: s.bundleMinPieces, returnWindowDays: s.returnWindowDays, maxQtyPerLook: s.maxQtyPerLook, codEnabled: s.codEnabled, codLimitPaise: s.codLimitPaise },
    announcement: s.announcement,
    support: { email: s.supportEmail, phone: s.supportPhone },
  };
}

/** Loads only ACTIVE products referenced by a cart. Anything else is treated as unavailable. */
export async function loadCatalogueForPricing(ex: Executor, sareeIds: string[], ornamentIds: string[]): Promise<CatalogueView> {
  const [sRows, oRows] = await Promise.all([
    sareeIds.length ? ex.select().from(sarees).where(and(inArray(sarees.id, sareeIds), eq(sarees.status, 'active'))) : [],
    ornamentIds.length ? ex.select().from(ornaments).where(and(inArray(ornaments.id, ornamentIds), eq(ornaments.status, 'active'))) : [],
  ]);
  return {
    sarees: new Map(sRows.map((r) => [r.id, r])),
    ornaments: new Map(oRows.map((r) => [r.id, r])),
  };
}
