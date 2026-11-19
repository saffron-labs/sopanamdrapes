import Link from 'next/link';
import { db } from '@/db/client';
import { requireAdmin } from '@/admin/session';
import { inr } from '@/admin/format';
import { dashboard } from '@/services/admin-misc';
import { Badge, Flash, Head, one, type SP } from '../ui';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const ctx = await requireAdmin('reports.read');
  const sp = await searchParams;
  const d = await dashboard(db(), ctx);
  const max = Math.max(1, ...d.series.map((s) => s.totalPaise));
  const attention = d.refundPending.length + d.returnRequests.length + d.mismatches.length + d.lowStock.length;
  const open = (d.byStatus.placed ?? 0) + (d.byStatus.confirmed ?? 0) + (d.byStatus.packed ?? 0);

  return (
    <>
      <Head title="Dashboard" sub="Sales are counted from placed orders, in Indian time." />
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="l">Today</div><div className="n">{inr(d.todayPaise)}</div><div className="sub">{d.todayOrders} orders</div></div>
        <div className="card stat"><div className="l">Last 7 days</div><div className="n">{inr(d.weekPaise)}</div></div>
        <div className="card stat"><div className="l">Last 30 days</div><div className="n">{inr(d.monthPaise)}</div><div className="sub">{d.monthOrders} orders</div></div>
        <div className="card stat"><div className="l">To handle</div><div className="n">{open}</div><div className="sub"><Link href="/admin/orders?status=open">Open orders</Link></div></div>
      </div>

      <div className="card">
        <h2>Needs your attention {attention === 0 ? '' : `(${attention})`}</h2>
        {attention === 0 ? <div className="mute">All clear.</div> : (
          <div className="tablewrap"><table><tbody>
            {d.refundPending.map((o) => <tr key={`r${o.id}`}><td><Badge v="refund_pending" /></td><td><Link href={`/admin/orders/${o.id}`}>{o.number}</Link></td><td>Refund owed: {inr(o.total)}</td></tr>)}
            {d.returnRequests.map((o) => <tr key={`q${o.id}`}><td><Badge v="return_requested" /></td><td><Link href={`/admin/orders/${o.id}`}>{o.number}</Link></td><td>Customer asked to return</td></tr>)}
            {d.mismatches.map((o) => <tr key={`m${o.id}`}><td><span className="badge b-failed">Check payment</span></td><td><Link href={`/admin/orders/${o.id}`}>{o.number}</Link></td><td className="bad">Amount paid did not match the order</td></tr>)}
            {d.lowStock.map((p) => <tr key={p.kind + p.id}><td><span className="badge b-draft">Low stock</span></td><td><Link href={`/admin/catalog/${p.kind}/${p.id}`}>{p.id}</Link></td><td>{p.name}: {p.stock} left</td></tr>)}
          </tbody></table></div>
        )}
      </div>

      <div className="grid g2">
        <div className="card"><h2>Last 14 days</h2>
          <div className="bars" role="img" aria-label="Daily sales for the last 14 days">{d.series.map((s) => <div key={s.day} title={`${s.day}: ${inr(s.totalPaise)}`} style={{ height: `${Math.max(2, (s.totalPaise / max) * 100)}%` }} />)}</div>
          <div className="sub" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span>{d.series[0]?.day}</span><span>{d.series.at(-1)?.day}</span></div>
        </div>
        <div className="card"><h2>Top sarees (30 days)</h2>
          {d.topSarees.length === 0 ? <div className="mute">No sales yet.</div> : <table><tbody>{d.topSarees.map((s) => <tr key={s.id}><td><Link href={`/admin/catalog/saree/${s.id}`}>{s.name}</Link></td><td className="r">{s.units} sold</td><td className="r">{inr(s.revenue)}</td></tr>)}</tbody></table>}
        </div>
      </div>
    </>
  );
}
