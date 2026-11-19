import { z } from 'zod';
import type { Executor } from '@/db/client';
import { settings as settingsTable } from '@/db/schema';

// Every business rule the client may want to change lives here, not in code.
export const settingsSchema = z.object({
  /** Percent off ornaments when a look contains at least `bundleMinPieces` ornaments. */
  bundlePercent: z.number().int().min(0).max(50),
  bundleMinPieces: z.number().int().min(1).max(7),
  codEnabled: z.boolean(),
  /** Largest order total (paise) that may be paid by Cash on Delivery. */
  codLimitPaise: z.number().int().min(0).max(10_000_000),
  codFeePaise: z.number().int().min(0).max(100_000),
  shippingFlatPaise: z.number().int().min(0).max(100_000),
  /** Orders at or above this amount (paise) ship free. 0 disables free shipping. */
  freeShippingOverPaise: z.number().int().min(0).max(100_000_000),
  returnWindowDays: z.number().int().min(0).max(60),
  /** How long stock is held for an unpaid online order. */
  reservationMinutes: z.number().int().min(5).max(120),
  maxQtyPerLook: z.number().int().min(1).max(10),
  /** Kill switch: stops new orders without taking the site down. */
  checkoutOpen: z.boolean(),
  supportEmail: z.string().email().max(200),
  supportPhone: z.string().max(30),
  announcement: z.string().max(200),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  bundlePercent: 10,
  bundleMinPieces: 2,
  codEnabled: true,
  codLimitPaise: 500_000, // ₹5,000, to be confirmed with the client
  codFeePaise: 0,
  shippingFlatPaise: 0, // shipping charges were never published on the old site; confirm with the client
  freeShippingOverPaise: 0,
  returnWindowDays: 7,
  reservationMinutes: 30,
  maxQtyPerLook: 3,
  checkoutOpen: true,
  supportEmail: 'care@sopanamdrapes.com',
  supportPhone: '',
  announcement: '',
};

let cache: { at: number; value: Settings } | undefined;
const TTL_MS = 15_000;

export function clearSettingsCache() {
  cache = undefined;
}

export async function getSettings(ex: Executor, opts: { fresh?: boolean } = {}): Promise<Settings> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await ex.select().from(settingsTable);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  // Stored values were validated on write; fall back to defaults field-by-field if something is corrupt.
  const parsed = settingsSchema.safeParse(merged);
  const value = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(ex: Executor, patch: Partial<Settings>, actor: string): Promise<{ before: Settings; after: Settings }> {
  const before = await getSettings(ex, { fresh: true });
  const after = settingsSchema.parse({ ...before, ...patch });
  for (const key of Object.keys(after) as (keyof Settings)[]) {
    if (JSON.stringify(after[key]) === JSON.stringify(before[key])) continue;
    await ex.insert(settingsTable).values({ key, value: after[key], updatedBy: actor })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: after[key], updatedBy: actor, updatedAt: new Date() } });
  }
  clearSettingsCache();
  return { before, after };
}
