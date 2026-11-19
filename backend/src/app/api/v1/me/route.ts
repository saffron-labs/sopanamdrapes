import { route } from '@/lib/http';
import { updateProfile, profileInput, listAddresses, listWishlist } from '@/services/customer';

export const GET = route({ auth: 'customer' }, async ({ db, session }) => ({
  customer: { id: session.customerId, phone: session.phone, name: session.name, email: session.email },
  addresses: await listAddresses(db, session.customerId),
  wishlist: await listWishlist(db, session.customerId),
}));
export const PATCH = route({ auth: 'customer', body: profileInput, limit: { name: 'profile', max: 30, windowSec: 600 } },
  async ({ db, session, body }) => ({ customer: await updateProfile(db, session.customerId, body) }));
