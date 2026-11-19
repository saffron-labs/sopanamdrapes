import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { freshDb } from './helpers';
import { ornaments, sarees, defaultLooks } from '@/db/schema';

// Guards the catalogue file against the schema constraints before it ever reaches production.
describe('catalogue seed data', () => {
  it('fits the schema', async () => {
    const db = await freshDb();
    const data = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/catalog.json'), 'utf8'));
    for (const o of data.ornaments) await db.insert(ornaments).values({ id: o.id, name: o.name, slot: o.category, mrpPaise: Math.round(o.price * 100), discountPercent: Math.round(o.discountPercent ?? 0), stock: o.stock, status: 'active' });
    for (const s of data.sarees) {
      await db.insert(sarees).values({ id: s.id, name: s.name, mrpPaise: Math.round(s.price * 100), discountPercent: Math.round(s.discountPercent ?? 0), stock: s.stock, blouseType: s.blouseType, status: 'active' });
      const combo = Object.values(s.defaultCombo ?? {}).filter(Boolean) as string[];
      if (combo.length) await db.insert(defaultLooks).values(combo.map((ornamentId) => ({ sareeId: s.id, ornamentId })));
    }
    expect((await db.select().from(sarees)).length).toBe(data.sarees.length);
  });
});
