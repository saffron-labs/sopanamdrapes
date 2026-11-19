import { db } from '@/db/client';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';
import { purgeRateLimits } from '@/lib/rate-limit';
import { closeSettledOrders, expireStaleOrders } from '@/services/orders';
import { purgeExpiredAuth } from '@/services/auth';
import { purgeExpiredAdminSessions } from '@/services/admin-auth';

export const dynamic = 'force-dynamic';

/** Called every few minutes by the scheduler with `Authorization: Bearer $CRON_SECRET` (Vercel Cron does this automatically). */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!secret || !safeEqual(given, secret)) return new Response('Unauthorized', { status: 401 });
  const d = db();
  const expired = await expireStaleOrders(d);
  const closed = await closeSettledOrders(d);
  await Promise.all([purgeExpiredAuth(d), purgeExpiredAdminSessions(d), purgeRateLimits(d)]);
  return Response.json({ ok: true, expired, closed });
}
