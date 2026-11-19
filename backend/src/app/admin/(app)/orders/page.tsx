import Link from 'next/link';
import { db } from '@/db/client';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '@/db/schema';
import { requireAdmin } from '@/admin/session';
import { can } from '@/lib/rbac';
import { inr, label, when } from '@/admin/format';
import { listOrders } from '@/services/admin-orders';
import { Badge, Empty, Flash, Head, Pager, one, queryString, type SP } from '../../ui';

export const dynamic = 'force-dynamic';

export default async function Orders({ searchParams }: { searchParams: SP }) {
  const ctx = await requireAdmin('orders.read');
  const sp = await searchParams;
  const f = { status: one(sp.status), payment: one(sp.payment), q: one(sp.q), page: Number(one(sp.page)) || 1 };
  const r = await listOrders(db(), ctx, f);
  const base = `/admin/orders${queryString({ status: f.status, payment: f.payment, q: f.q })}`;

  return (
    <>
      <Head title="Orders" sub={`${r.total} found`}>
        {can(ctx.role, 'orders.export') ? <a className="btn ghost" href={`/admin/orders/export${queryString({ status: f.status, payment: f.payment, q: f.q })}`}>Download CSV</a> : null}
      </Head>
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <form className="filters" method="get">
        <div><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={f.q} placeholder="Order no., phone, name, AWB" maxLength={60} /></div>
        <div><label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={f.status}><option value="">All (except unpaid checkouts)</option><option value="open">Open (to handle)</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
        <div><label htmlFor="payment">Payment</label>
          <select id="payment" name="payment" defaultValue={f.payment}><option value="">Any</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
        <button className="btn" type="submit">Filter</button>
      </form>
      <div className="card tablewrap">
        {r.rows.length === 0 ? <Empty>No orders match. Try clearing the filters.</Empty> : (
          <table>
            <thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Status</th><th>Payment</th><th className="r">Total</th></tr></thead>
            <tbody>{r.rows.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`}>{o.number}</Link></td><td>{when(o.createdAt)}</td>
                <td>{o.address.name}<div className="sub">{o.contactPhone} · {o.address.city}</div></td>
                <td><Badge v={o.status} /></td><td><Badge v={o.paymentStatus} /> <span className="sub">{o.paymentMethod === 'cod' ? 'COD' : 'Online'}</span></td>
                <td className="r">{inr(o.totalPaise)}</td>
              </tr>))}</tbody>
          </table>)}
        <Pager base={base} page={r.page} pages={r.pages} />
      </div>
    </>
  );
}
