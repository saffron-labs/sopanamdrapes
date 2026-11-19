import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { requireAdmin } from '@/admin/session';
import { can } from '@/lib/rbac';
import { inrExact, label, when } from '@/admin/format';
import { ApiError } from '@/lib/errors';
import { adminOrder } from '@/services/admin-orders';
import { TRANSITIONS } from '@/services/orders';
import { orderNoteAction, orderRefundAction, orderTransitionAction, returnDecisionAction } from '../../../actions';
import { Badge, Flash, Head, one, type SP } from '../../../ui';

export const dynamic = 'force-dynamic';

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireAdmin('orders.read');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  let d: Awaited<ReturnType<typeof adminOrder>>;
  try { d = await adminOrder(db(), ctx, id); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const o = d.order;
  const canUpdate = can(ctx.role, 'orders.update');
  const targets = TRANSITIONS[o.status].filter((s) => s !== 'pending_payment' && s !== 'closed');
  const refunded = d.refunds.filter((r) => r.status !== 'failed').reduce((a, r) => a + r.amountPaise, 0);
  const paidOnline = d.payments.some((p) => p.status === 'captured' || p.status === 'refunded');
  const needsRefund = o.paymentMethod === 'online' ? paidOnline : o.paymentStatus === 'cod_collected';
  const looks = [...new Set(d.items.map((i) => i.lookIndex))];

  return (
    <>
      <Head title={o.number} sub={`Placed ${when(o.createdAt)}`}><Link className="btn ghost" href="/admin/orders">All orders</Link></Head>
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <div className="grid g2">
        <div className="card">
          <h2>Status</h2>
          <p><Badge v={o.status} /> <Badge v={o.paymentStatus} /> <span className="sub">{o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'}</span></p>
          {o.trackingAwb ? <p>Shipped via {o.trackingCarrier || 'courier'}: <b>{o.trackingAwb}</b></p> : null}
          {o.cancelReason ? <p className="warn">Cancelled: {o.cancelReason}</p> : null}
          {o.customerNote ? <p><b>Customer note:</b> {o.customerNote}</p> : null}
          {canUpdate && o.status === 'return_requested' && d.returnRequest ? (
            <div><p className="warn"><b>Return requested:</b> {d.returnRequest.reason}</p>
              <form action={returnDecisionAction} className="field"><input type="hidden" name="id" value={o.id} />
                <label htmlFor="rnote">Note to keep</label><input id="rnote" name="note" maxLength={300} />
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn sm" name="decision" value="approve">Approve</button>
                  <button className="btn ghost sm" name="decision" value="reject">Reject (back to delivered)</button>
                  <button className="btn ghost sm" name="decision" value="received">Item received</button>
                  <label style={{ margin: 0 }}><input type="checkbox" name="restock" /> put back in stock</label>
                </div></form></div>
          ) : null}
          {canUpdate && targets.length > 0 && o.status !== 'return_requested' ? targets.map((t) => (
            <form key={t} action={orderTransitionAction} className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value={t} />
              {t === 'shipped' ? <div className="row"><div><label htmlFor="carrier">Courier</label><input id="carrier" name="carrier" maxLength={60} /></div><div><label htmlFor="awb">Tracking / AWB</label><input id="awb" name="awb" maxLength={60} required /></div></div> : null}
              {t === 'cancelled' ? <div className="field"><label htmlFor="cnote">Reason</label><input id="cnote" name="note" maxLength={200} required /></div> : null}
              {t === 'returned' ? <label><input type="checkbox" name="restock" /> Put the items back in stock</label> : null}
              <button className={`btn sm ${t === 'cancelled' ? 'danger' : ''}`} type="submit">Mark {label(t).toLowerCase()}</button>
            </form>)) : null}
        </div>

        <div className="card">
          <h2>Customer</h2>
          <p><Link href={`/admin/customers/${d.customer?.id ?? ''}`}>{o.address.name}</Link><br />{o.contactPhone}{o.contactEmail ? <><br />{o.contactEmail}</> : null}</p>
          <h2>Deliver to</h2>
          <p style={{ margin: 0 }}>{o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ''}<br />{o.address.city}, {o.address.state} {o.address.pincode}<br />{o.address.phone}</p>
        </div>
      </div>

      <div className="card tablewrap">
        <h2>Items</h2>
        <table><thead><tr><th>Look</th><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Bundle off</th></tr></thead>
          <tbody>{d.items.map((i) => (
            <tr key={i.id}><td>{looks.length > 1 ? `#${i.lookIndex + 1}` : ''}</td><td>{i.name} <span className="sub">{i.productId}{i.slot ? ` · ${i.slot}` : ''}</span></td><td className="r">{i.qty}</td><td className="r">{inrExact(i.unitPricePaise * i.qty)}</td><td className="r">{i.discountPaise ? `-${inrExact(i.discountPaise)}` : ''}</td></tr>))}</tbody></table>
        <table style={{ marginTop: 10, maxWidth: 360, marginLeft: 'auto' }}><tbody>
          <tr><td>Subtotal</td><td className="r">{inrExact(o.subtotalPaise)}</td></tr>
          {o.bundleDiscountPaise ? <tr><td>Bundle discount</td><td className="r">-{inrExact(o.bundleDiscountPaise)}</td></tr> : null}
          {o.promoDiscountPaise ? <tr><td>Promo {o.promoCode}</td><td className="r">-{inrExact(o.promoDiscountPaise)}</td></tr> : null}
          {o.shippingPaise ? <tr><td>Shipping</td><td className="r">{inrExact(o.shippingPaise)}</td></tr> : null}
          {o.codFeePaise ? <tr><td>COD fee</td><td className="r">{inrExact(o.codFeePaise)}</td></tr> : null}
          <tr><td><b>Total</b></td><td className="r"><b>{inrExact(o.totalPaise)}</b></td></tr>
        </tbody></table>
      </div>

      <div className="grid g2">
        <div className="card tablewrap"><h2>Payments and refunds</h2>
          {d.payments.length === 0 ? <div className="mute">No payment attempts.</div> : (
            <table><tbody>{d.payments.map((p) => <tr key={p.id}><td>{p.provider === 'cod' ? 'COD' : p.providerPaymentId ?? 'Razorpay (not paid)'}</td><td><Badge v={p.status} /></td><td className="r">{inrExact(p.amountPaise)}</td></tr>)}</tbody></table>)}
          {d.refunds.length > 0 ? <table style={{ marginTop: 8 }}><tbody>{d.refunds.map((r) => <tr key={r.id}><td>Refund · {when(r.createdAt)}<div className="sub">{r.reason}</div></td><td><Badge v={r.status} /></td><td className="r">{inrExact(r.amountPaise)}</td></tr>)}</tbody></table> : null}
          {can(ctx.role, 'orders.refund') && needsRefund ? (
            <form action={orderRefundAction} style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <input type="hidden" name="id" value={o.id} />
              <div className="row"><div><label htmlFor="amount">Amount in ₹ <span className="hint">blank = everything left ({inrExact(Math.max(0, o.totalPaise - refunded))})</span></label><input id="amount" name="amount" type="number" min="1" step="0.01" /></div>
                <div><label htmlFor="rreason">Reason</label><input id="rreason" name="reason" required maxLength={300} /></div></div>
              <button className="btn danger sm" type="submit">Refund</button>
              {o.paymentMethod === 'cod' ? <span className="sub"> COD refunds are recorded here; you send the money yourself.</span> : null}
            </form>) : null}
        </div>
        <div className="card"><h2>Internal note</h2>
          <form action={orderNoteAction}><input type="hidden" name="id" value={o.id} />
            <textarea name="note" defaultValue={o.adminNote} maxLength={1000} aria-label="Internal note" disabled={!canUpdate} />
            {canUpdate ? <div style={{ marginTop: 8 }}><button className="btn sm" type="submit">Save note</button></div> : null}</form>
          <h2 style={{ marginTop: 18 }}>History</h2>
          <ul className="timeline">{d.events.map((e) => <li key={e.id}><b>{label(e.toStatus)}</b> <span className="sub">{when(e.createdAt)} · {e.actorType}{e.actorType === 'admin' && e.actorId ? ` (${e.actorId})` : ''}</span>{e.note ? <div className="sub">{e.note}</div> : null}</li>)}</ul>
        </div>
      </div>
    </>
  );
}
