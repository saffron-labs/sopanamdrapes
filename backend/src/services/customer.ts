import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { addresses, customers, sarees, wishlist } from '@/db/schema';
import { badRequest, notFound } from '@/lib/errors';
import { normalizePhone } from './auth';

const text = (max: number) => z.string().trim().min(1).max(max);

export const profileInput = z.object({ name: text(80).optional(), email: z.string().trim().toLowerCase().email().max(120).or(z.literal('')).optional() }).strict();

export async function updateProfile(db: Db, customerId: string, raw: unknown) {
  const p = profileInput.parse(raw);
  const patch: Partial<{ name: string; email: string | null }> = {};
  if (p.name !== undefined) patch.name = p.name;
  if (p.email !== undefined) patch.email = p.email === '' ? null : p.email;
  if (!Object.keys(patch).length) throw badRequest('Nothing to update');
  const [row] = await db.update(customers).set(patch).where(eq(customers.id, customerId)).returning({ id: customers.id, phone: customers.phone, name: customers.name, email: customers.email });
  if (!row) throw notFound('Account not found');
  return row;
}

export const addressInput = z.object({
  label: z.string().trim().max(20).default('Home'),
  name: text(80),
  phone: z.string().transform((v, ctx) => { try { return normalizePhone(v); } catch { ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number' }); return z.NEVER; } }),
  line1: text(160),
  line2: z.string().trim().max(160).default(''),
  city: text(60),
  state: text(60),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
  isDefault: z.boolean().default(false),
}).strict();

const MAX_ADDRESSES = 10;
const shape = (a: typeof addresses.$inferSelect) => ({ id: a.id, label: a.label, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault });

export async function listAddresses(db: Db, customerId: string) {
  const rows = await db.select().from(addresses).where(and(eq(addresses.customerId, customerId), isNull(addresses.deletedAt))).orderBy(sql`${addresses.isDefault} desc`, addresses.createdAt);
  return rows.map(shape);
}

export async function saveAddress(db: Db, customerId: string, raw: unknown, id?: string) {
  const a = addressInput.parse(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from customers where id = ${customerId} for update`); // serialises concurrent edits for one customer
    const live = await tx.select({ id: addresses.id }).from(addresses).where(and(eq(addresses.customerId, customerId), isNull(addresses.deletedAt)));
    if (!id && live.length >= MAX_ADDRESSES) throw badRequest(`You can save up to ${MAX_ADDRESSES} addresses`);
    const makeDefault = a.isDefault || live.length === 0;
    if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customerId));
    if (id) {
      const [r] = await tx.update(addresses).set({ ...a, isDefault: makeDefault }).where(and(eq(addresses.id, id), eq(addresses.customerId, customerId), isNull(addresses.deletedAt))).returning();
      if (!r) throw notFound('Address not found');
      return shape(r);
    }
    const [r] = await tx.insert(addresses).values({ ...a, isDefault: makeDefault, customerId }).returning();
    return shape(r!);
  });
}

/** Soft delete: past orders keep their own address snapshot, but the address may still be referenced by an idempotent checkout. */
export async function deleteAddress(db: Db, customerId: string, id: string) {
  const r = await db.update(addresses).set({ deletedAt: new Date(), isDefault: false }).where(and(eq(addresses.id, id), eq(addresses.customerId, customerId), isNull(addresses.deletedAt))).returning({ id: addresses.id });
  if (!r.length) throw notFound('Address not found');
}

export async function listWishlist(db: Db, customerId: string): Promise<string[]> {
  const rows = await db.select({ id: wishlist.sareeId }).from(wishlist).innerJoin(sarees, eq(sarees.id, wishlist.sareeId)).where(and(eq(wishlist.customerId, customerId), eq(sarees.status, 'active'))).orderBy(wishlist.createdAt);
  return rows.map((r) => r.id);
}

export async function setWishlist(db: Db, customerId: string, sareeId: string, on: boolean) {
  if (!/^SA\d{5}$/.test(sareeId)) throw badRequest('Unknown saree');
  if (!on) { await db.delete(wishlist).where(and(eq(wishlist.customerId, customerId), eq(wishlist.sareeId, sareeId))); return; }
  const [s] = await db.select({ id: sarees.id }).from(sarees).where(and(eq(sarees.id, sareeId), eq(sarees.status, 'active')));
  if (!s) throw notFound('Saree not found');
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(wishlist).where(eq(wishlist.customerId, customerId));
  if (n >= 200) throw badRequest('Wishlist is full');
  await db.insert(wishlist).values({ customerId, sareeId }).onConflictDoNothing();
}
