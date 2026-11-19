import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { freshDb } from './helpers';
import { rowsOf } from '@/lib/sql-rows';
import type { Db } from '@/db/client';
import { auditLog } from '@/db/schema';

let d: Db;
beforeAll(async () => { d = await freshDb(); });

describe('database hardening', () => {
  it('audit log is append-only', async () => {
    await d.insert(auditLog).values({ adminEmail: 'a@b.c', action: 'x', entity: 'y' });
    await expect(d.execute(sql`UPDATE audit_log SET action = 'tampered'`)).rejects.toThrow();
    await expect(d.execute(sql`DELETE FROM audit_log`)).rejects.toThrow();
  });

  it('row level security is enabled on every table', async () => {
    const list = rowsOf(await d.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity AND tablename NOT LIKE '%drizzle%'`));
    expect(list).toEqual([]);
  });

  it('rejects malformed phone numbers at the database level', async () => {
    await expect(d.execute(sql`INSERT INTO customers (phone) VALUES ('12345')`)).rejects.toThrow();
  });
});
