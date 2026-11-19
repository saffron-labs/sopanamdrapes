import { z } from 'zod';
import { route } from '@/lib/http';
import { listWishlist, setWishlist } from '@/services/customer';

const body = z.object({ sareeId: z.string().regex(/^SA\d{5}$/), on: z.boolean() }).strict();
export const GET = route({ auth: 'customer' }, ({ db, session }) => listWishlist(db, session.customerId));
export const PUT = route({ auth: 'customer', body, limit: { name: 'wishlist', max: 120, windowSec: 600 } }, async ({ db, session, body }) => {
  await setWishlist(db, session.customerId, body.sareeId, body.on);
  return { wishlist: await listWishlist(db, session.customerId) };
});
