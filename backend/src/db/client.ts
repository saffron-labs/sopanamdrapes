import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the root database or a transaction. */
export type Executor = Db | Tx;

let instance: Db | undefined;
let sqlClient: ReturnType<typeof postgres> | undefined;

export function db(): Db {
  if (instance) return instance;
  const url = env().DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Supabase pooled connections (pgbouncer, transaction mode) do not support prepared statements.
  sqlClient = postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: env().NODE_ENV === 'production' ? 'require' : undefined });
  instance = drizzlePg(sqlClient, { schema }) as unknown as Db;
  return instance;
}

/** Tests inject an in-process Postgres (PGlite) here. */
export function setDb(d: Db | undefined) {
  instance = d;
}

export { schema };
