import { z } from 'zod';
import { route } from '@/lib/http';
import { requestReturn, getCustomerOrder } from '@/services/orders';
import { notFound } from '@/lib/errors';

const body = z.object({ reason: z.string().trim().min(3, 'Tell us why').max(300) }).strict();
export const POST = route<z.infer<typeof body>, { id: string }>({ auth: 'customer', body, limit: { name: 'order-return', max: 10, windowSec: 600 } }, async ({ db, session, body, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) throw notFound('Order not found');
  await requestReturn(db, session.customerId, params.id, body.reason);
  return getCustomerOrder(db, session.customerId, params.id);
});
