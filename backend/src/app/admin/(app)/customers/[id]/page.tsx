import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { requireAdmin } from '@/admin/session';
import { can } from '@/lib/rbac';
import { ApiError } from '@/lib/errors';
import { inr, when } from '@/admin/format';
import { customerDetail } from '@/services/admin-misc';
import { blockCustomerAction } from '../../../actions';
import { Badge, Empty, Flash, Head, one, type SP } from '../../../ui';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireAdmin('customers.read');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  let d: Awaited<ReturnType<typeof customerDetail>>;
  try { d = await customerDetail(db(), ctx, id); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const c = d.customer; const blocked = c.status === 'blocked';
  return (
    <>
      <Head title={c.name || c.phone} sub={`Joined ${when(c.createdAt)}`}><Link className="btn ghost" href="/admin/customers">All customers</Link></Head>
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <div className="card"><p><Badge v={c.status} /></p><p>{c.phone}{c.email ? <><br />{c.email}</> : null}</p>
        {can(ctx.role, 'orders.update') ? (
          <form action={blockCustomerAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="block" value={blocked ? '0' : '1'} />
            <button className={`btn sm ${blocked ? '' : 'danger'}`} type="submit">{blocked ? 'Unblock customer' : 'Block customer'}</button>
            <span className="sub"> {blocked ? 'They will be able to sign in again.' : 'They are signed out and cannot place new orders.'}</span></form>) : null}
      </div>
      <div className="card tablewrap"><h2>Orders</h2>
        {d.orders.length === 0 ? <Empty>No orders yet.</Empty> : <table><tbody>{d.orders.map((o) => <tr key={o.id}><td><Link href={`/admin/orders/${o.id}`}>{o.number}</Link></td><td>{when(o.createdAt)}</td><td><Badge v={o.status} /></td><td className="r">{inr(o.totalPaise)}</td></tr>)}</tbody></table>}
      </div>
    </>
  );
}
