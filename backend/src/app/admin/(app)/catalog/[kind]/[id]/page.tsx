import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { ornaments, SLOTS, WORLDS } from '@/db/schema';
import { requireAdmin } from '@/admin/session';
import { can } from '@/lib/rbac';
import { ApiError } from '@/lib/errors';
import { label, toLocalInput, when } from '@/admin/format';
import { getProduct, type Kind } from '@/services/admin-catalog';
import { uploadImageAction, defaultLookAction, productStatusAction, saveProductAction, stockAction } from '../../../../actions';
import { Badge, Field, Flash, Head, one, type SP } from '../../../../ui';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: SP }) {
  const ctx = await requireAdmin('catalog.read');
  const { kind: k, id } = await params;
  if (k !== 'saree' && k !== 'ornament') notFound();
  const kind: Kind = k;
  const sp = await searchParams;
  const isNew = id === 'new';
  if (isNew) await requireAdmin('catalog.write');
  let data: Awaited<ReturnType<typeof getProduct>> | null = null;
  if (!isNew) { try { data = await getProduct(db(), ctx, kind, id); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; } }
  const p = data?.row as (Record<string, unknown> & { id: string }) | undefined;
  const v = <T,>(key: string, d: T): T => (p && p[key] != null ? (p[key] as T) : d);
  const write = can(ctx.role, 'catalog.write');
  const orn = kind === 'saree' && !isNew ? await db().select({ id: ornaments.id, name: ornaments.name, slot: ornaments.slot }).from(ornaments).where(eq(ornaments.status, 'active')).orderBy(asc(ornaments.slot), asc(ornaments.id)) : [];
  const worlds = v<string[]>('worlds', []);

  return (
    <>
      <Head title={isNew ? `New ${kind}` : `${p?.id} · ${String(v('name', ''))}`} sub={p ? `Updated ${when(p.updatedAt as Date)}` : undefined}>
        <Link className="btn ghost" href={`/admin/catalog?kind=${kind}`}>Back to list</Link>
        {p && write ? (['active', 'draft', 'archived'] as const).filter((s) => s !== p.status).map((s) => (
          <form key={s} action={productStatusAction}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={s} /><input type="hidden" name="back" value={`/admin/catalog/${kind}/${p.id}`} />
            <button className="btn ghost sm" type="submit">{s === 'active' ? 'Publish' : s === 'draft' ? 'Move to draft' : 'Archive'}</button></form>)) : null}
      </Head>
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      {p ? <p><Badge v={String(p.status)} /></p> : null}

      <form action={saveProductAction} className="card">
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={isNew ? '' : id} />
        <fieldset disabled={!write} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="row"><Field name="name" label="Name"><input id="name" name="name" defaultValue={v('name', '')} required minLength={2} maxLength={120} /></Field>
            <Field name="status" label="Visibility"><select id="status" name="status" defaultValue={v('status', 'draft')}><option value="draft">Draft (hidden)</option><option value="active">Live</option><option value="archived">Archived</option></select></Field></div>
          <Field name="description" label="Description"><textarea id="description" name="description" defaultValue={v('description', '')} maxLength={2000} /></Field>
          <Field name="highlights" label="Highlights" hint="one per line, up to 8"><textarea id="highlights" name="highlights" defaultValue={v<string[]>('highlights', []).join('\n')} /></Field>
          <div className="row">
            <Field name="mrp" label="MRP (₹)"><input id="mrp" name="mrp" type="number" min="1" step="1" required defaultValue={p ? Number(p.mrpPaise) / 100 : ''} /></Field>
            <Field name="discountPercent" label="Discount %"><input id="discountPercent" name="discountPercent" type="number" min="0" max="90" defaultValue={v('discountPercent', 0)} /></Field>
            <Field name="discountStartsAt" label="Discount starts" hint="optional, IST"><input id="discountStartsAt" name="discountStartsAt" type="datetime-local" defaultValue={toLocalInput(v<Date | null>('discountStartsAt', null))} /></Field>
            <Field name="discountEndsAt" label="Discount ends" hint="optional, IST"><input id="discountEndsAt" name="discountEndsAt" type="datetime-local" defaultValue={toLocalInput(v<Date | null>('discountEndsAt', null))} /></Field>
          </div>
          <div className="row">
            {isNew ? <Field name="stock" label="Opening stock"><input id="stock" name="stock" type="number" min="0" defaultValue={0} /></Field> : null}
            <Field name="lowStockThreshold" label="Warn me at or below"><input id="lowStockThreshold" name="lowStockThreshold" type="number" min="0" defaultValue={v('lowStockThreshold', 5)} /></Field>
            <Field name="position" label="Sort position" hint="lower shows first"><input id="position" name="position" type="number" min="0" defaultValue={v('position', 0)} /></Field>
          </div>
          {kind === 'saree' ? (<>
            <div className="row">
              <Field name="colour" label="Colour"><input id="colour" name="colour" defaultValue={v('colour', '')} maxLength={60} /></Field>
              <Field name="fabric" label="Fabric"><input id="fabric" name="fabric" defaultValue={v('fabric', '')} maxLength={80} /></Field>
              <Field name="blouseType" label="Blouse"><select id="blouseType" name="blouseType" defaultValue={v('blouseType', 'unstitched')}><option value="unstitched">Unstitched piece</option><option value="stitched">Stitched</option><option value="none">No blouse</option></select></Field>
            </div>
            <div className="field"><label>Shown in</label><div className="actions">{WORLDS.map((w) => <label key={w} style={{ fontWeight: 400 }}><input type="checkbox" name="worlds" value={w} defaultChecked={worlds.includes(w)} /> {label(w)}</label>)}</div></div>
            <Field name="tags" label="Tags" hint="comma separated, e.g. Onam, Deepavali"><input id="tags" name="tags" defaultValue={v<string[]>('tags', []).join(', ')} /></Field>
          </>) : (
            <div className="row">
              <Field name="slot" label="Type"><select id="slot" name="slot" defaultValue={v('slot', 'necklace')}>{SLOTS.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
              <Field name="material" label="Material"><input id="material" name="material" defaultValue={v('material', 'Fashion jewellery')} maxLength={80} /></Field>
            </div>)}
          <Field name="images" label="Images" hint="one per line: a /path or https:// link. First is the main photo"><textarea id="images" name="images" defaultValue={v<string[]>('images', []).join('\n')} /></Field>
          {write ? <button className="btn" type="submit">{isNew ? `Create ${kind}` : 'Save changes'}</button> : null}
        </fieldset>
      </form>

      {p && write ? (
        <form action={uploadImageAction} className="card"><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={p.id} />
          <h2>Add a photo</h2>
          <div className="actions"><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required aria-label="Photo" style={{ maxWidth: 360 }} /><button className="btn sm" type="submit">Upload</button></div>
          <div className="sub" style={{ marginTop: 6 }}>JPG, PNG or WebP, up to 5 MB. It is added to the Images list above; edit that list to reorder or remove.</div>
        </form>) : null}

      {p && can(ctx.role, 'stock.adjust') ? (
        <div className="grid g2">
          <div className="card"><h2>Stock: {Number(p.stock)} in hand</h2>
            <form action={stockAction}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={p.id} />
              <div className="row"><Field name="mode" label="Change"><select id="mode" name="mode"><option value="add">Add or remove (use a minus to remove)</option><option value="set">Set to a counted number</option></select></Field>
                <Field name="amount" label="Number"><input id="amount" name="amount" type="number" step="1" required /></Field></div>
              <Field name="reason" label="Why" hint="required, kept in the history"><input id="reason" name="reason" required maxLength={200} placeholder="New batch received" /></Field>
              <button className="btn sm" type="submit">Update stock</button></form></div>
          <div className="card tablewrap"><h2>Stock history</h2>
            {data!.moves.length === 0 ? <div className="mute">No movements yet.</div> : <table><tbody>{data!.moves.map((m) => <tr key={m.id}><td>{when(m.createdAt)}</td><td>{label(m.reason)}{m.note ? <div className="sub">{m.note}</div> : null}</td><td className={`r ${m.delta < 0 ? 'bad' : ''}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td></tr>)}</tbody></table>}</div>
        </div>) : null}

      {kind === 'saree' && p && write ? (
        <form action={defaultLookAction} className="card"><input type="hidden" name="id" value={p.id} />
          <h2>Default look <span className="hint">the ornaments shown with this saree at first</span></h2>
          {SLOTS.map((slot) => { const opts = orn.filter((o) => o.slot === slot); if (!opts.length) return null; return (
            <div key={slot} className="field"><label style={{ textTransform: 'capitalize' }}>{slot}</label><div className="actions">{opts.map((o) => <label key={o.id} style={{ fontWeight: 400 }}><input type="checkbox" name="ornaments" value={o.id} defaultChecked={data!.looks.includes(o.id)} /> {o.name}</label>)}</div></div>); })}
          <button className="btn sm" type="submit">Save default look</button>
        </form>) : null}
    </>
  );
}
