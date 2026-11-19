import { z } from 'zod';
import { route } from '@/lib/http';
import { addressInput, deleteAddress, saveAddress } from '@/services/customer';
import { badRequest } from '@/lib/errors';

type P = { id: string };
const uuid = (id: string) => { if (!z.string().uuid().safeParse(id).success) throw badRequest('Invalid address'); return id; };
export const PUT = route<z.infer<typeof addressInput>, P>({ auth: 'customer', body: addressInput, limit: { name: 'address', max: 30, windowSec: 600 } },
  async ({ db, session, body, params }) => ({ address: await saveAddress(db, session.customerId, body, uuid(params.id)) }));
export const DELETE = route<undefined, P>({ auth: 'customer', limit: { name: 'address', max: 30, windowSec: 600 } },
  async ({ db, session, params }) => { await deleteAddress(db, session.customerId, uuid(params.id)); return { ok: true }; });
