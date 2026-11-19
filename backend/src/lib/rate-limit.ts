import { sql } from 'drizzle-orm';
import type { Executor } from '@/db/client';
import { ApiError } from './errors';
import { rowsOf } from './sql-rows';

export type RateResult = { ok: boolean; remaining: number; retryAfter: number };

/**
 * Fixed-window counter stored in Postgres, so it works across serverless instances without Redis.
 * One atomic upsert per check.
 */
export async function rateLimit(ex: Executor, key: string, limit: number, windowSec: number, now = Date.now()): Promise<RateResult> {
  const window = Math.floor(now / 1000 / windowSec) * windowSec;
  const res = await ex.execute(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${window}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);
  const count = Number(rowsOf<{ count: number }>(res)[0]?.count ?? 1);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfter: window + windowSec - Math.floor(now / 1000) };
}

/** Throws a 429 with Retry-After when the limit is exceeded. */
export async function enforceRateLimit(ex: Executor, key: string, limit: number, windowSec: number, message = 'Too many attempts. Please wait a moment and try again'): Promise<void> {
  const r = await rateLimit(ex, key, limit, windowSec);
  if (!r.ok) throw new ApiError('rate_limited', message, { retryAfter: r.retryAfter }, { 'Retry-After': String(r.retryAfter) });
}

export async function purgeRateLimits(ex: Executor, olderThanSec = 86_400): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanSec;
  await ex.execute(sql`DELETE FROM rate_limits WHERE window_start < ${cutoff}`);
}
