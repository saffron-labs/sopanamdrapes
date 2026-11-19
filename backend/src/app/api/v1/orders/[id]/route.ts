import { z } from 'zod';
import { route } from '@/lib/http';
import { getCustomerOrder } from '@/services/orders';
import { notFound } from '@/lib/errors';

export const GET = route<undefined, { id: string }>({ auth: 'customer' }, ({ db, session, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) throw notFound('Order not found');
  return getCustomerOrder(db, session.customerId, params.id);
});
