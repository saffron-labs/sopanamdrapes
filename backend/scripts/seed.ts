// Loads the storefront catalogue (docs/catalog.json) into the database. Safe to re-run: existing products are left untouched
// (so admin edits are never overwritten); only missing ones are inserted.
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { rowsOf } from '../src/lib/sql-rows';
import { defaultLooks, ornaments, sarees, stockMovements } from '../src/db/schema';

type S = { id: string; name: string; color?: string; fabric?: string; description?: string; highlights?: string[]; blouseType?: string; price: number; discountPercent?: number; stock: number; images?: string[]; occasion?: string | null; occasionTag?: string | null; defaultCombo?: Record<string, string | null> };
type O = { id: string; name: string; category: string; description?: string; highlights?: string[]; price: number; discountPercent?: number; stock: number; images?: string[] };

const file = path.resolve(import.meta.dirname, process.argv[2] ?? '../../docs/catalog.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { sarees: S[]; ornaments: O[] };
const d = db();
const WORLD_OF: Record<string, 'bridal' | 'festive' | 'occasions' | 'everyday'> = { wedding: 'bridal', festivals: 'festive', occasional: 'occasions', office: 'everyday' };
const rupees = (n: number) => Math.round(n * 100);

await d.transaction(async (tx) => {
  let i = 0;
  for (const o of data.ornaments) {
    const r = await tx.insert(ornaments).values({
      id: o.id, name: o.name, slot: o.category as never, description: o.description ?? '', highlights: o.highlights ?? [],
      mrpPaise: rupees(o.price), discountPercent: Math.round(o.discountPercent ?? 0), stock: o.stock, images: o.images ?? [], status: 'active', position: i++,
    }).onConflictDoNothing().returning({ id: ornaments.id });
    if (r.length && o.stock > 0) await tx.insert(stockMovements).values({ productKind: 'ornament', productId: o.id, delta: o.stock, reason: 'initial', actor: 'seed' });
  }
  i = 0;
  for (const s of data.sarees) {
    const worlds = [s.occasion ? WORLD_OF[s.occasion] : undefined].filter((w): w is NonNullable<typeof w> => !!w);
    const r = await tx.insert(sarees).values({
      id: s.id, name: s.name, colour: s.color ?? '', fabric: s.fabric ?? '', description: s.description ?? '', highlights: s.highlights ?? [],
      blouseType: (s.blouseType as never) ?? 'unstitched', worlds, tags: [s.occasionTag].filter((t): t is string => !!t),
      mrpPaise: rupees(s.price), discountPercent: Math.round(s.discountPercent ?? 0), stock: s.stock, images: s.images ?? [], status: 'active', position: i++,
    }).onConflictDoNothing().returning({ id: sarees.id });
    if (r.length) {
      if (s.stock > 0) await tx.insert(stockMovements).values({ productKind: 'saree', productId: s.id, delta: s.stock, reason: 'initial', actor: 'seed' });
      const combo = Object.values(s.defaultCombo ?? {}).filter((x): x is string => !!x);
      if (combo.length) await tx.insert(defaultLooks).values(combo.map((ornamentId) => ({ sareeId: s.id, ornamentId }))).onConflictDoNothing();
    }
  }
});
const [counts] = rowsOf<{ s: number; o: number }>(await d.execute(sql`select (select count(*) from sarees)::int as s, (select count(*) from ornaments)::int as o`));
console.log(`Catalogue ready: ${counts?.s} sarees, ${counts?.o} ornaments.`);
process.exit(0);
