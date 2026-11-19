import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { defaultLooks, ornaments, sarees, SLOTS, stockMovements, WORLDS } from '@/db/schema';
import { audit, type AdminCtx } from '@/lib/audit';
import { badRequest, notFound } from '@/lib/errors';
import { assertCan } from '@/lib/rbac';

export type Kind = 'saree' | 'ornament';
const table = (k: Kind) => (k === 'saree' ? sarees : ornaments);

// Image references end up in <img src>. Only same-site paths and https URLs: never javascript:, data: or protocol-relative URLs.
const imageRef = z.string().trim().max(500).refine((v) => (/^\/[A-Za-z0-9/_\-.]+$/.test(v) && !v.includes('..')) || /^https:\/\/[^\s"'<>]+$/.test(v), 'Image must be a /path or an https:// URL');
const lines = (max: number, len: number) => z.array(z.string().trim().min(1).max(len)).max(max);

const common = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
  highlights: lines(8, 160).default([]),
  mrpRupees: z.number().int().min(1).max(10_000_000),
  discountPercent: z.number().int().min(0).max(90).default(0),
  discountStartsAt: z.date().nullable().default(null),
  discountEndsAt: z.date().nullable().default(null),
  stock: z.number().int().min(0).max(100_000),
  lowStockThreshold: z.number().int().min(0).max(1000).default(5),
  images: z.array(imageRef).max(8).default([]),
  specs: z.record(z.string().trim().min(1).max(40), z.string().trim().max(200)).default({}),
  status: z.enum(['active', 'draft', 'archived']).default('draft'),
  position: z.number().int().min(0).max(100_000).default(0),
};

export const sareeInput = z.object({
  ...common,
  colour: z.string().trim().max(60).default(''),
  fabric: z.string().trim().max(80).default(''),
  blouseType: z.enum(['unstitched', 'stitched', 'none']).default('unstitched'),
  worlds: z.array(z.enum(WORLDS)).max(5).default([]),
  tags: lines(15, 40).default([]),
}).refine((v) => !v.discountStartsAt || !v.discountEndsAt || v.discountStartsAt < v.discountEndsAt, { message: 'Discount must end after it starts', path: ['discountEndsAt'] });

export const ornamentInput = z.object({
  ...common,
  slot: z.enum(SLOTS),
  material: z.string().trim().max(80).default('Fashion jewellery'),
}).refine((v) => !v.discountStartsAt || !v.discountEndsAt || v.discountStartsAt < v.discountEndsAt, { message: 'Discount must end after it starts', path: ['discountEndsAt'] });

export type SareeInput = z.infer<typeof sareeInput>;
export type OrnamentInput = z.infer<typeof ornamentInput>;

export async function listProducts(db: Db, ctx: AdminCtx, kind: Kind, f: { q?: string; status?: string; lowStock?: boolean } = {}) {
  assertCan(ctx.role, 'catalog.read');
  const t = table(kind);
  const conds = [];
  if (f.q?.trim()) { const like = `%${f.q.trim().replace(/[%_\\]/g, '\\$&')}%`; conds.push(or(ilike(t.name, like), ilike(t.id, like))); }
  if (f.status && ['active', 'draft', 'archived'].includes(f.status)) conds.push(eq(t.status, f.status as 'active'));
  if (f.lowStock) conds.push(sql`${t.stock} <= ${t.lowStockThreshold}`);
  return db.select().from(t).where(conds.length ? and(...conds) : undefined).orderBy(asc(t.position), asc(t.id));
}

export async function getProduct(db: Db, ctx: AdminCtx, kind: Kind, id: string) {
  assertCan(ctx.role, 'catalog.read');
  const t = table(kind);
  const [row] = await db.select().from(t).where(eq(t.id, id));
  if (!row) throw notFound('Product not found');
  const moves = await db.select().from(stockMovements).where(and(eq(stockMovements.productKind, kind), eq(stockMovements.productId, id))).orderBy(desc(stockMovements.createdAt)).limit(30);
  const looks = kind === 'saree' ? (await db.select().from(defaultLooks).where(eq(defaultLooks.sareeId, id))).map((l) => l.ornamentId) : [];
  return { row, moves, looks };
}

async function nextId(db: Db, kind: Kind): Promise<string> {
  const prefix = kind === 'saree' ? 'SA' : 'OR';
  const t = table(kind);
  const [r] = await db.select({ m: sql<string | null>`max(${t.id})` }).from(t).where(sql`${t.id} ~ '^${sql.raw(prefix)}[0-9]{5}$'`);
  const n = r?.m ? Number(r.m.slice(2)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, '0')}`;
}

export async function saveProduct(db: Db, ctx: AdminCtx, kind: Kind, raw: unknown, id?: string): Promise<string> {
  assertCan(ctx.role, 'catalog.write');
  const parsed = (kind === 'saree' ? sareeInput : ornamentInput).safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const { mrpRupees, ...rest } = parsed.data;
  const values = { ...rest, mrpPaise: mrpRupees * 100, updatedAt: new Date() };
  const t = table(kind);

  return db.transaction(async (tx) => {
    if (id) {
      const [before] = await tx.select().from(t).where(eq(t.id, id)).for('update');
      if (!before) throw notFound('Product not found');
      // Stock is changed only through adjustStock() so every change has a reason and a ledger row.
      const { stock: _ignored, ...patch } = values;
      await tx.update(t).set(patch as never).where(eq(t.id, id));
      await audit(tx, ctx, `${kind}.update`, kind, id, before, { ...patch, stock: before.stock });
      return id;
    }
    const newId = await nextId(tx as unknown as Db, kind);
    await tx.insert(t).values({ id: newId, ...values } as never);
    if (values.stock > 0) await tx.insert(stockMovements).values({ productKind: kind, productId: newId, delta: values.stock, reason: 'initial', actor: `admin:${ctx.email}` });
    await audit(tx, ctx, `${kind}.create`, kind, newId, null, values);
    return newId;
  });
}

export async function setProductStatus(db: Db, ctx: AdminCtx, kind: Kind, id: string, status: 'active' | 'draft' | 'archived') {
  assertCan(ctx.role, 'catalog.write');
  const t = table(kind);
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ status: t.status }).from(t).where(eq(t.id, id)).for('update');
    if (!before) throw notFound('Product not found');
    await tx.update(t).set({ status, updatedAt: new Date() }).where(eq(t.id, id));
    await audit(tx, ctx, `${kind}.status`, kind, id, before, { status });
  });
}

/** Every stock change has a reason, an actor and a ledger row. `mode: 'set'` counts the shelf and records the difference. */
export async function adjustStock(db: Db, ctx: AdminCtx, kind: Kind, id: string, change: { mode: 'add' | 'set'; amount: number; reason: string }) {
  assertCan(ctx.role, 'stock.adjust');
  if (!Number.isInteger(change.amount) || Math.abs(change.amount) > 100_000) throw badRequest('Enter a whole number');
  if (!change.reason.trim()) throw badRequest('Say why the stock is changing (for example: new batch received, damaged, stock count)');
  const t = table(kind);
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ stock: t.stock }).from(t).where(eq(t.id, id)).for('update');
    if (!row) throw notFound('Product not found');
    const next = change.mode === 'set' ? change.amount : row.stock + change.amount;
    if (next < 0) throw badRequest(`That would take stock below zero (currently ${row.stock})`);
    const delta = next - row.stock;
    if (delta === 0) return next;
    await tx.update(t).set({ stock: next, updatedAt: new Date() }).where(eq(t.id, id));
    await tx.insert(stockMovements).values({ productKind: kind, productId: id, delta, reason: 'adjust', actor: `admin:${ctx.email}`, note: change.reason.trim().slice(0, 200) });
    await audit(tx, ctx, `${kind}.stock`, kind, id, { stock: row.stock }, { stock: next, reason: change.reason });
    return next;
  });
}

export async function setDefaultLook(db: Db, ctx: AdminCtx, sareeId: string, ornamentIds: string[]) {
  assertCan(ctx.role, 'catalog.write');
  const unique = [...new Set(ornamentIds)];
  await db.transaction(async (tx) => {
    const [s] = await tx.select({ id: sarees.id }).from(sarees).where(eq(sarees.id, sareeId));
    if (!s) throw notFound('Saree not found');
    const before = (await tx.select().from(defaultLooks).where(eq(defaultLooks.sareeId, sareeId))).map((l) => l.ornamentId);
    await tx.delete(defaultLooks).where(eq(defaultLooks.sareeId, sareeId));
    if (unique.length) {
      const valid = await tx.select({ id: ornaments.id }).from(ornaments).where(sql`${ornaments.id} in ${unique}`);
      if (valid.length !== unique.length) throw badRequest('One of the ornaments does not exist');
      await tx.insert(defaultLooks).values(unique.map((ornamentId) => ({ sareeId, ornamentId })));
    }
    await audit(tx, ctx, 'saree.default_look', 'saree', sareeId, before, unique);
  });
}
