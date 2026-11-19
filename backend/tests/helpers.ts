import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { setDb, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { clearSettingsCache } from '@/lib/settings';
import { setRazorpayClient } from '@/services/razorpay';
import { setOtpSender } from '@/services/otp-sender';
import { captureMail } from '@/services/notify';

// Test environment: deterministic secrets, in-process Postgres (PGlite) running the real migrations.
export function testEnv() {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3000',
    SESSION_PEPPER: 'test-pepper-test-pepper-test-pepper-test-pepper',
    DATA_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
    CRON_SECRET: 'cron-secret-cron-secret',
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_KEY_SECRET: 'rzp_test_secret',
    RAZORPAY_WEBHOOK_SECRET: 'whsec_test',
    OTP_DRIVER: 'console',
    TRUST_PROXY: '1',
  });
  resetEnvCache();
  clearSettingsCache();
}

let shared: Db | undefined;
let client: PGlite | undefined;

/** One migrated database per test file; every call wipes it back to empty (append-only triggers are bypassed for the wipe only). */
export async function freshDb(): Promise<Db> {
  testEnv();
  if (!shared) {
    client = new PGlite();
    shared = drizzle(client, { schema }) as unknown as Db;
    await migrate(shared as never, { migrationsFolder: path.resolve(import.meta.dirname, '../drizzle') });
  }
  const tables = schema.tableNames;
  await client!.exec(`SET session_replication_role = replica; TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE; SET session_replication_role = origin; ALTER SEQUENCE order_number_seq RESTART WITH 1001;`);
  setDb(shared);
  setRazorpayClient(undefined);
  setOtpSender(undefined);
  captureMail(false);
  clearSettingsCache();
  return shared;
}
