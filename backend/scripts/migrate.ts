import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }

// Use a DIRECT (non-pooled) connection for migrations when you have one.
const client = postgres(url, { max: 1, prepare: false, ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined });
await migrate(drizzle(client), { migrationsFolder: path.resolve(import.meta.dirname, '../drizzle') });
console.log('Migrations applied.');
await client.end();
