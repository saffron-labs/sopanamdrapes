import { db } from '@/db/client';
import { requireAdmin } from '@/admin/session';
import { when } from '@/admin/format';
import { listAudit } from '@/services/admin-misc';
import { Empty, Head, Pager, one, queryString, type SP } from '../../ui';

export const dynamic = 'force-dynamic';

export default async function Audit({ searchParams }: { searchParams: SP }) {
  const ctx = await requireAdmin('audit.read');
  const sp = await searchParams;
  const q = one(sp.q); const entity = one(sp.entity); const page = Number(one(sp.page)) || 1;
  const rows = await listAudit(db(), ctx, { q, entity, page });
  return (
    <>
      <Head title="Activity log" sub="Every change made in this admin. Entries cannot be edited or deleted." />
      <form className="filters" method="get"><div><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} placeholder="Person, action or id" maxLength={60} /></div>
        <div><label htmlFor="entity">Area</label><select id="entity" name="entity" defaultValue={entity}><option value="">All</option>{['order', 'saree', 'ornament', 'customer', 'promo', 'settings', 'admin_user'].map((e) => <option key={e} value={e}>{e}</option>)}</select></div>
        <button className="btn" type="submit">Filter</button></form>
      <div className="card tablewrap">
        {rows.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Item</th><th>Details</th></tr></thead>
            <tbody>{rows.map((a) => <tr key={a.id}><td>{when(a.createdAt)}</td><td>{a.adminEmail}<div className="sub">{a.ip}</div></td><td>{a.action}</td><td>{a.entity} {a.entityId}</td>
              <td className="sub"><details><summary>View</summary><pre style={{ whiteSpace: 'pre-wrap', margin: 0, maxWidth: 420, overflow: 'auto' }}>{JSON.stringify({ before: a.before, after: a.after }, null, 1).slice(0, 2000)}</pre></details></td></tr>)}</tbody></table>)}
        <Pager base={`/admin/audit${queryString({ q, entity })}`} page={page} pages={rows.length === 50 ? page + 1 : page} />
      </div>
    </>
  );
}
