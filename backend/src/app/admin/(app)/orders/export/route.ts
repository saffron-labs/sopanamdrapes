import { db } from '@/db/client';
import { currentAdmin } from '@/admin/session';
import { ApiError } from '@/lib/errors';
import { exportOrdersCsv } from '@/services/admin-orders';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ctx = await currentAdmin();
  if (!ctx) return new Response('Unauthorized', { status: 401 });
  const u = new URL(req.url).searchParams;
  try {
    const csv = await exportOrdersCsv(db(), ctx, { status: u.get('status') ?? undefined, payment: u.get('payment') ?? undefined, q: u.get('q') ?? undefined });
    return new Response('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ApiError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
