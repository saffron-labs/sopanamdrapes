import Link from 'next/link';
import { db } from '@/db/client';
import { requireAdmin } from '@/admin/session';
import { inr, when } from '@/admin/format';
import { listCustomers } from '@/services/admin-misc';
import { Badge, Empty, Head, Pager, one, queryString, type SP } from '../../ui';

export const dynamic = 'force-dynamic';

export default async function Customers({ searchParams }: { searchParams: SP }) {
  const ctx = await requireAdmin('customers.read');
  const sp = await searchParams;
  const q = one(sp.q); const page = Number(one(sp.page)) || 1;
  const rows = await listCustomers(db(), ctx, q, page);
  return (
    <>
      <Head title="Customers" sub="Customers sign in with their mobile number. We never store passwords for them." />
      <form className="filters" method="get"><div><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} placeholder="Phone, name or email" maxLength={60} /></div><button className="btn" type="submit">Search</button></form>
      <div className="card tablewrap">
        {rows.length === 0 ? <Empty>No customers found.</Empty> : (
          <table><thead><tr><th>Customer</th><th>Joined</th><th className="r">Orders</th><th className="r">Spent</th><th>Status</th></tr></thead>
            <tbody>{rows.map(({ c, orders, spent }) => <tr key={c.id}><td><Link href={`/admin/customers/${c.id}`}>{c.name || c.phone}</Link><div className="sub">{c.phone}{c.email ? ` · ${c.email}` : ''}</div></td><td>{when(c.createdAt)}</td><td className="r">{orders}</td><td className="r">{inr(spent)}</td><td><Badge v={c.status} /></td></tr>)}</tbody></table>)}
        <Pager base={`/admin/customers${queryString({ q })}`} page={page} pages={rows.length === 25 ? page + 1 : page} />
      </div>
    </>
  );
}
