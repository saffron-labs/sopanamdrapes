import { z } from 'zod';
import { route } from '@/lib/http';
import { quote } from '@/services/orders';
import { getSession } from '@/services/auth';
import { readCookie, SESSION_COOKIE } from '@/lib/http';

const look = z.object({ sareeId: z.string().regex(/^SA\d{5}$/), ornamentIds: z.array(z.string().regex(/^OR\d{5}$/)).max(7), qty: z.number().int().min(1).max(10) }).strict();
const body = z.object({ looks: z.array(look).min(1).max(20), paymentMethod: z.enum(['online', 'cod']).default('online'), promoCode: z.string().trim().toUpperCase().max(24).optional() }).strict();

/** Prices a bag. The client sends only ids; every amount comes from the server. */
export const POST = route({ body, limit: { name: 'quote', max: 60, windowSec: 60 } }, async ({ db, body, req }) => {
  const s = await getSession(db, readCookie(req, SESSION_COOKIE()));
  return quote(db, { ...body, customerId: s?.customerId });
});
