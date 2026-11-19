import { route } from '@/lib/http';
import { addressInput, listAddresses, saveAddress } from '@/services/customer';

export const GET = route({ auth: 'customer' }, ({ db, session }) => listAddresses(db, session.customerId));
export const POST = route({ auth: 'customer', body: addressInput, limit: { name: 'address', max: 30, windowSec: 600 } }, async ({ db, session, body }) => ({ address: await saveAddress(db, session.customerId, body) }));
