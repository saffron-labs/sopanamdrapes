import { db } from '@/db/client';
import { requireAdmin } from '@/admin/session';
import { can } from '@/lib/rbac';
import { inr, when } from '@/admin/format';
import { listPromos } from '@/services/admin-misc';
import { promoActiveAction, savePromoAction } from '../../actions';
import { Badge, Empty, Field, Flash, Head, one, type SP } from '../../ui';

export const dynamic = 'force-dynamic';

export default async function Promos({ searchParams }: { searchParams: SP }) {
  const ctx = await requireAdmin('orders.read');
  const sp = await searchParams;
  const rows = await listPromos(db(), ctx);
  const write = can(ctx.role, 'promos.write');
  return (
    <>
      <Head title="Promo codes" sub="A code can never make an order free; at least ₹1 is always charged." />
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <div className="card tablewrap">
        {rows.length === 0 ? <Empty>No promo codes yet.</Empty> : (
          <table><thead><tr><th>Code</th><th>Offer</th><th>Rules</th><th className="r">Used</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.code}><td><b>{p.code}</b><div className="sub">{p.note}</div></td>
                <td>{p.kind === 'percent' ? `${p.value}% off` : `${inr(p.value)} off`}{p.maxDiscountPaise ? ` (max ${inr(p.maxDiscountPaise)})` : ''}</td>
                <td className="sub">{p.minSubtotalPaise ? `Min ${inr(p.minSubtotalPaise)} · ` : ''}{p.perCustomerLimit}/customer{p.startsAt ? ` · from ${when(p.startsAt)}` : ''}{p.endsAt ? ` · until ${when(p.endsAt)}` : ''}</td>
                <td className="r">{p.usedCount}{p.usageLimit ? ` / ${p.usageLimit}` : ''}</td><td><Badge v={p.active ? 'active' : 'archived'} /></td>
                <td>{write ? <form action={promoActiveAction}><input type="hidden" name="code" value={p.code} /><input type="hidden" name="active" value={p.active ? '0' : '1'} /><button className="btn ghost sm" type="submit">{p.active ? 'Switch off' : 'Switch on'}</button></form> : null}</td></tr>))}</tbody></table>)}
      </div>
      {write ? (
        <form action={savePromoAction} className="card"><h2>New promo code</h2>
          <div className="row"><Field name="code" label="Code" hint="letters and numbers"><input id="code" name="code" required maxLength={24} style={{ textTransform: 'uppercase' }} /></Field>
            <Field name="kind" label="Type"><select id="kind" name="kind"><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option></select></Field>
            <Field name="value" label="Value" hint="% (1-90) or ₹"><input id="value" name="value" type="number" min="1" required /></Field></div>
          <div className="row"><Field name="minSubtotal" label="Minimum order ₹"><input id="minSubtotal" name="minSubtotal" type="number" min="0" /></Field>
            <Field name="maxDiscount" label="Max discount ₹" hint="optional"><input id="maxDiscount" name="maxDiscount" type="number" min="1" /></Field>
            <Field name="usageLimit" label="Total uses" hint="optional"><input id="usageLimit" name="usageLimit" type="number" min="1" /></Field>
            <Field name="perCustomerLimit" label="Uses per customer"><input id="perCustomerLimit" name="perCustomerLimit" type="number" min="1" defaultValue={1} /></Field></div>
          <div className="row"><Field name="startsAt" label="Starts" hint="optional, IST"><input id="startsAt" name="startsAt" type="datetime-local" /></Field><Field name="endsAt" label="Ends" hint="optional, IST"><input id="endsAt" name="endsAt" type="datetime-local" /></Field>
            <Field name="note" label="Note to yourself"><input id="note" name="note" maxLength={200} /></Field></div>
          <button className="btn" type="submit">Save promo code</button></form>) : null}
    </>
  );
}
