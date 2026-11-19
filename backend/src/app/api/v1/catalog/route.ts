import { route, json } from '@/lib/http';
import { getPublicCatalogue } from '@/services/catalogue';

export const dynamic = 'force-dynamic';
// Short shared cache: the catalogue is public and stock is re-checked atomically at checkout anyway.
export const GET = route({ limit: { name: 'catalog', max: 120, windowSec: 60 } }, async ({ db }) =>
  json(await getPublicCatalogue(db), 200, { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60' }));
