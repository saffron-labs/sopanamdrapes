import { z } from 'zod';
import { route, json } from '@/lib/http';
import { createOrder, listCustomerOrders } from '@/services/orders';
import { badRequest } from '@/lib/errors';

const look = z.object({ sareeId: z.string().regex(/^SA\d{5}$/), ornamentIds: z.array(z.string().regex(/^OR\d{5}$/)).max(7), qty: z.number().int().min(1).max(10) }).strict();
const body = z.object({
  looks: z.array(look).min(1).max(20), paymentMethod: z.enum(['online', 'cod']), addressId: z.string().uuid(),
  promoCode: z.string().trim().toUpperCase().max(24).optional(), note: z.string().trim().max(300).optional(),
}).strict();

export const GET = route({ auth: 'customer' }, ({ db, session }) => listCustomerOrders(db, session.customerId));

/** Idempotency-Key header makes a double-tap or a retry return the same order instead of a second one. */
export const POST = route({ auth: 'customer', body, limit: { name: 'checkout', max: 20, windowSec: 600 } }, async ({ db, session, body, req }) => {
  const key = req.headers.get('idempotency-key') ?? undefined;
  if (key !== undefined && !/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw badRequest('Invalid Idempotency-Key');
  const r = await createOrder(db, { customer: { id: session.customerId, phone: session.phone, email: session.email }, ...body, idempotencyKey: key });
  return json(r, r.reused ? 200 : 201);
});
