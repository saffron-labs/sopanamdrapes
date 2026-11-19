import Link from 'next/link';
import { db } from '@/db/client';
import { requireAdmin } from '@/admin/session';
import { can } from '@/lib/rbac';
import { inr } from '@/admin/format';
import { listProducts, type Kind } from '@/services/admin-catalog';
import { Badge, Empty, Flash, Head, one, type SP } from '../../ui';

export const dynamic = 'force-dynamic';

export default async function Catalogue({ searchParams }: { searchParams: SP }) {
  const ctx = await requireAdmin('catalog.read');
  const sp = await searchParams;
  const kind: Kind = one(sp.kind) === 'ornament' ? 'ornament' : 'saree';
  const q = one(sp.q); const status = one(sp.status); const lowStock = one(sp.low) === '1';
  const rows = await listProducts(db(), ctx, kind, { q, status, lowStock });
  return (
    <>
      <Head title="Catalogue" sub={`${rows.length} ${kind === 'saree' ? 'sarees' : 'ornaments'}`}>
        {can(ctx.role, 'catalog.write') ? <Link className="btn" href={`/admin/catalog/${kind}/new`}>Add {kind}</Link> : null}
      </Head>
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <div className="tabs"><Link href="/admin/catalog?kind=saree" className={kind === 'saree' ? 'on' : ''}>Sarees</Link><Link href="/admin/catalog?kind=ornament" className={kind === 'ornament' ? 'on' : ''}>Ornaments</Link></div>
      <form className="filters" method="get"><input type="hidden" name="kind" value={kind} />
        <div><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} maxLength={60} placeholder="Name or code" /></div>
        <div><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={status}><option value="">All</option><option value="active">Live</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
        <label style={{ margin: 0 }}><input type="checkbox" name="low" value="1" defaultChecked={lowStock} /> Low stock only</label>
        <button className="btn" type="submit">Filter</button>
      </form>
      <div className="card tablewrap">
        {rows.length === 0 ? <Empty>Nothing here yet. {can(ctx.role, 'catalog.write') ? 'Add your first product above.' : ''}</Empty> : (
          <table><thead><tr><th>Code</th><th>Name</th><th className="r">MRP</th><th className="r">Off</th><th className="r">Stock</th><th>Status</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}><td><Link href={`/admin/catalog/${kind}/${p.id}`}>{p.id}</Link></td><td>{p.name}{'slot' in p ? <span className="sub"> · {p.slot}</span> : null}</td>
                <td className="r">{inr(p.mrpPaise)}</td><td className="r">{p.discountPercent ? `${p.discountPercent}%` : ''}</td>
                <td className={`r ${p.stock <= p.lowStockThreshold ? 'warn' : ''}`}>{p.stock}</td><td><Badge v={p.status} /></td></tr>))}</tbody></table>)}
      </div>
    </>
  );
}
