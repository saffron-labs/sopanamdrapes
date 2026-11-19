import { db } from '@/db/client';
import { requireAdmin } from '@/admin/session';
import { getSettings } from '@/lib/settings';
import { saveSettingsAction } from '../../actions';
import { Field, Flash, Head, one, type SP } from '../../ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin('settings.write');
  const sp = await searchParams;
  const s = await getSettings(db(), { fresh: true });
  const r = (p: number) => p / 100;
  return (
    <>
      <Head title="Settings" sub="Business rules. Changes apply to the storefront within seconds and are recorded in the activity log." />
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      <form action={saveSettingsAction}>
        <div className="card"><h2>Orders</h2>
          <label style={{ fontWeight: 400 }}><input type="checkbox" name="checkoutOpen" defaultChecked={s.checkoutOpen} /> Accept new orders <span className="hint">(untick to pause checkout without taking the site down)</span></label>
          <div className="row" style={{ marginTop: 12 }}>
            <Field name="maxQtyPerLook" label="Max quantity per look"><input id="maxQtyPerLook" name="maxQtyPerLook" type="number" min="1" max="10" defaultValue={s.maxQtyPerLook} /></Field>
            <Field name="reservationMinutes" label="Hold stock for unpaid orders (minutes)"><input id="reservationMinutes" name="reservationMinutes" type="number" min="5" max="120" defaultValue={s.reservationMinutes} /></Field>
            <Field name="returnWindowDays" label="Return window (days)"><input id="returnWindowDays" name="returnWindowDays" type="number" min="0" max="60" defaultValue={s.returnWindowDays} /></Field></div></div>
        <div className="card"><h2>Ornament bundle offer</h2>
          <div className="row"><Field name="bundlePercent" label="Discount on ornaments (%)"><input id="bundlePercent" name="bundlePercent" type="number" min="0" max="50" defaultValue={s.bundlePercent} /></Field>
            <Field name="bundleMinPieces" label="Applies from this many ornaments in a look"><input id="bundleMinPieces" name="bundleMinPieces" type="number" min="1" max="7" defaultValue={s.bundleMinPieces} /></Field></div></div>
        <div className="card"><h2>Shipping and Cash on Delivery</h2>
          <div className="row"><Field name="shippingFlat" label="Shipping charge (₹)"><input id="shippingFlat" name="shippingFlat" type="number" min="0" step="1" defaultValue={r(s.shippingFlatPaise)} /></Field>
            <Field name="freeShippingOver" label="Free shipping over (₹)" hint="0 = never"><input id="freeShippingOver" name="freeShippingOver" type="number" min="0" step="1" defaultValue={r(s.freeShippingOverPaise)} /></Field></div>
          <label style={{ fontWeight: 400 }}><input type="checkbox" name="codEnabled" defaultChecked={s.codEnabled} /> Allow Cash on Delivery</label>
          <div className="row" style={{ marginTop: 12 }}><Field name="codLimit" label="Largest COD order (₹)"><input id="codLimit" name="codLimit" type="number" min="0" step="1" defaultValue={r(s.codLimitPaise)} /></Field>
            <Field name="codFee" label="COD fee (₹)"><input id="codFee" name="codFee" type="number" min="0" step="1" defaultValue={r(s.codFeePaise)} /></Field></div></div>
        <div className="card"><h2>Storefront</h2>
          <div className="row"><Field name="supportEmail" label="Support email"><input id="supportEmail" name="supportEmail" type="email" required maxLength={200} defaultValue={s.supportEmail} /></Field>
            <Field name="supportPhone" label="Support phone"><input id="supportPhone" name="supportPhone" maxLength={30} defaultValue={s.supportPhone} /></Field></div>
          <Field name="announcement" label="Announcement bar" hint="leave empty to hide"><input id="announcement" name="announcement" maxLength={200} defaultValue={s.announcement} /></Field></div>
        <button className="btn" type="submit">Save settings</button>
      </form>
    </>
  );
}
