'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/db/client';
import { ADMIN_ROLES, ORDER_STATUSES, type AdminRole, type OrderStatus } from '@/db/schema';
import { ApiError } from '@/lib/errors';
import { encryptSecret } from '@/lib/crypto';
import { ADMIN_COOKIE, PENDING_COOKIE, cookieOpts, requestMeta, requireAdmin } from '@/admin/session';
import { fromLocalInput } from '@/admin/format';
import { adminLogout, adminPasswordLogin, adminVerifyTotp, changeOwnPassword } from '@/services/admin-auth';
import { createAdminUser, resetAdminCredentials, updateAdmin } from '@/services/admin-users';
import { addProductImage, adjustStock, saveProduct, setDefaultLook, setProductStatus, type Kind } from '@/services/admin-catalog';
import { adminRefund, adminResolveReturn, adminSetNote, adminTransition } from '@/services/admin-orders';
import { savePromo, setCustomerBlocked, setPromoActive, updateSettings } from '@/services/admin-misc';

// ───────── helpers ─────────
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (f: FormData, k: string) => { const v = str(f, k); return v === '' ? NaN : Number(v); };
const optNum = (f: FormData, k: string) => { const v = str(f, k); return v === '' ? null : Number(v); };
const lines = (f: FormData, k: string) => str(f, k).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const bool = (f: FormData, k: string) => f.get(k) === 'on';
const kindOf = (v: string): Kind => (v === 'ornament' ? 'ornament' : 'saree');
const uuid = (v: string) => { if (!/^[0-9a-f-]{36}$/i.test(v)) throw new ApiError('bad_request', 'Invalid id'); return v; };

/** Redirect targets come from our own forms, but are still pinned to /admin so this can never become an open redirect. */
const safeBack = (v: string, fallback: string) => (/^\/admin(\/[A-Za-z0-9_\-/]*)?(\?[A-Za-z0-9_\-=&%.]*)?$/.test(v) ? v : fallback);

function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join('.') || 'field'}: ${i.message}`).join('; ');
  console.error('[admin action]', e instanceof Error ? e.stack : e);
  return 'Something went wrong. Nothing was changed';
}

/** Runs the action, then redirects with a one-line message. Redirect happens outside the try so Next can unwind it. */
async function run(back: string, fn: () => Promise<string | void>, then?: (msg: string) => string): Promise<never> {
  let ok = true; let msg = 'Saved';
  try { msg = (await fn()) ?? 'Saved'; } catch (e) { ok = false; msg = messageOf(e); }
  const target = ok && then ? then(msg) : back;
  redirect(`${target}${target.includes('?') ? '&' : '?'}${ok ? 'ok' : 'err'}=${encodeURIComponent(msg)}`);
}

// ───────── auth ─────────
export async function loginAction(f: FormData) {
  let ok = false; let err = '';
  try {
    const { token } = await adminPasswordLogin(db(), str(f, 'email'), String(f.get('password') ?? ''), await requestMeta());
    (await cookies()).set(PENDING_COOKIE(), token, cookieOpts(new Date(Date.now() + 5 * 60_000)));
    ok = true;
  } catch (e) { err = messageOf(e); }
  if (ok) redirect('/admin/login/verify');
  redirect('/admin/login?err=' + encodeURIComponent(err));
}

export async function verifyAction(f: FormData) {
  const jar = await cookies();
  let dest = '';
  try {
    const r = await adminVerifyTotp(db(), jar.get(PENDING_COOKIE())?.value, str(f, 'code').replace(/\s/g, ''), await requestMeta());
    jar.delete(PENDING_COOKIE());
    jar.set(ADMIN_COOKIE(), r.token, cookieOpts(r.expiresAt));
    dest = '/admin';
  } catch (e) { dest = '/admin/login/verify?err=' + encodeURIComponent(messageOf(e)); }
  redirect(dest);
}

export async function logoutAction() {
  const jar = await cookies();
  await adminLogout(db(), jar.get(ADMIN_COOKIE())?.value);
  jar.delete(ADMIN_COOKIE());
  redirect('/admin/login');
}

export async function changePasswordAction(f: FormData) {
  const ctx = await requireAdmin();
  const jar = await cookies();
  return run('/admin/team', async () => {
    if (str(f, 'next') !== str(f, 'confirm')) throw new ApiError('bad_request', 'The new passwords do not match');
    await changeOwnPassword(db(), ctx, String(f.get('current') ?? ''), String(f.get('next') ?? ''), jar.get(ADMIN_COOKIE())?.value);
    return 'Password changed. Other devices were signed out';
  });
}

// ───────── orders ─────────
export async function orderTransitionAction(f: FormData) {
  const ctx = await requireAdmin('orders.update');
  const id = uuid(str(f, 'id'));
  const to = str(f, 'to') as OrderStatus;
  return run(`/admin/orders/${id}`, async () => {
    if (!(ORDER_STATUSES as readonly string[]).includes(to)) throw new ApiError('bad_request', 'Unknown status');
    await adminTransition(db(), ctx, id, to, { note: str(f, 'note') || undefined, carrier: str(f, 'carrier') || undefined, awb: str(f, 'awb') || undefined, restock: bool(f, 'restock') });
    revalidatePath('/admin', 'layout');
    return `Order marked ${to.replace(/_/g, ' ')}`;
  });
}

export async function orderNoteAction(f: FormData) {
  const ctx = await requireAdmin('orders.update');
  const id = uuid(str(f, 'id'));
  return run(`/admin/orders/${id}`, async () => { await adminSetNote(db(), ctx, id, String(f.get('note') ?? '')); return 'Note saved'; });
}

export async function orderRefundAction(f: FormData) {
  const ctx = await requireAdmin('orders.refund');
  const id = uuid(str(f, 'id'));
  return run(`/admin/orders/${id}`, async () => {
    const amount = optNum(f, 'amount');
    const r = await adminRefund(db(), ctx, id, amount === null ? undefined : amount, str(f, 'reason'));
    return r.status === 'manual' ? 'Recorded. Send this refund manually (COD)' : 'Refund started with Razorpay';
  });
}

export async function returnDecisionAction(f: FormData) {
  const ctx = await requireAdmin('orders.update');
  const id = uuid(str(f, 'id'));
  const decision = str(f, 'decision');
  if (decision !== 'approve' && decision !== 'reject' && decision !== 'received') throw new ApiError('bad_request', 'Unknown decision');
  return run(`/admin/orders/${id}`, async () => { await adminResolveReturn(db(), ctx, id, decision, str(f, 'note'), bool(f, 'restock')); return 'Return updated'; });
}

// ───────── catalogue ─────────
export async function saveProductAction(f: FormData) {
  const ctx = await requireAdmin('catalog.write');
  const kind = kindOf(str(f, 'kind'));
  const id = str(f, 'id') || undefined;
  const base = {
    name: str(f, 'name'), description: str(f, 'description'), highlights: lines(f, 'highlights'),
    mrpRupees: num(f, 'mrp'), discountPercent: num(f, 'discountPercent') || 0,
    discountStartsAt: fromLocalInput(str(f, 'discountStartsAt')), discountEndsAt: fromLocalInput(str(f, 'discountEndsAt')),
    stock: id ? 0 : num(f, 'stock') || 0, lowStockThreshold: num(f, 'lowStockThreshold') || 0,
    images: lines(f, 'images'), specs: {}, status: str(f, 'status') || 'draft', position: num(f, 'position') || 0,
  };
  const raw = kind === 'saree'
    ? { ...base, colour: str(f, 'colour'), fabric: str(f, 'fabric'), blouseType: str(f, 'blouseType') || 'unstitched', worlds: f.getAll('worlds').map(String), tags: str(f, 'tags').split(',').map((s) => s.trim()).filter(Boolean) }
    : { ...base, slot: str(f, 'slot'), material: str(f, 'material') };
  let newId = id ?? '';
  return run(`/admin/catalog/${kind}/${id ?? 'new'}`, async () => { newId = await saveProduct(db(), ctx, kind, raw, id); revalidatePath('/admin/catalog'); return 'Saved'; }, () => `/admin/catalog/${kind}/${newId}`);
}

export async function productStatusAction(f: FormData) {
  const ctx = await requireAdmin('catalog.write');
  const kind = kindOf(str(f, 'kind')); const id = str(f, 'id'); const status = str(f, 'status');
  if (status !== 'active' && status !== 'draft' && status !== 'archived') throw new ApiError('bad_request', 'Unknown status');
  return run(safeBack(str(f, 'back'), `/admin/catalog?kind=${kind}`), async () => { await setProductStatus(db(), ctx, kind, id, status); return `Marked ${status}`; });
}

export async function stockAction(f: FormData) {
  const ctx = await requireAdmin('stock.adjust');
  const kind = kindOf(str(f, 'kind')); const id = str(f, 'id');
  const mode = str(f, 'mode') === 'set' ? 'set' : 'add';
  return run(`/admin/catalog/${kind}/${id}`, async () => `Stock is now ${await adjustStock(db(), ctx, kind, id, { mode, amount: num(f, 'amount'), reason: str(f, 'reason') })}`);
}

export async function defaultLookAction(f: FormData) {
  const ctx = await requireAdmin('catalog.write');
  const id = str(f, 'id');
  return run(`/admin/catalog/saree/${id}`, async () => { await setDefaultLook(db(), ctx, id, f.getAll('ornaments').map(String)); return 'Default look saved'; });
}

// ───────── customers / promos / settings ─────────
export async function blockCustomerAction(f: FormData) {
  const ctx = await requireAdmin('orders.update');
  const id = uuid(str(f, 'id')); const block = str(f, 'block') === '1';
  return run(`/admin/customers/${id}`, async () => { await setCustomerBlocked(db(), ctx, id, block); return block ? 'Customer blocked and signed out' : 'Customer unblocked'; });
}

export async function savePromoAction(f: FormData) {
  const ctx = await requireAdmin('promos.write');
  return run('/admin/promos', async () => {
    await savePromo(db(), ctx, {
      code: str(f, 'code'), kind: str(f, 'kind'), value: num(f, 'value'), minSubtotalRupees: num(f, 'minSubtotal') || 0, maxDiscountRupees: optNum(f, 'maxDiscount'),
      startsAt: fromLocalInput(str(f, 'startsAt')), endsAt: fromLocalInput(str(f, 'endsAt')), usageLimit: optNum(f, 'usageLimit'), perCustomerLimit: num(f, 'perCustomerLimit') || 1, note: str(f, 'note'),
    });
    return 'Promo saved';
  });
}

export async function promoActiveAction(f: FormData) {
  const ctx = await requireAdmin('promos.write');
  return run('/admin/promos', async () => { await setPromoActive(db(), ctx, str(f, 'code'), str(f, 'active') === '1'); return 'Updated'; });
}

export async function saveSettingsAction(f: FormData) {
  const ctx = await requireAdmin('settings.write');
  const rupeesToPaise = (k: string) => Math.round(num(f, k) * 100);
  return run('/admin/settings', async () => {
    await updateSettings(db(), ctx, {
      bundlePercent: num(f, 'bundlePercent'), bundleMinPieces: num(f, 'bundleMinPieces'), codEnabled: bool(f, 'codEnabled'),
      codLimitPaise: rupeesToPaise('codLimit'), codFeePaise: rupeesToPaise('codFee'), shippingFlatPaise: rupeesToPaise('shippingFlat'), freeShippingOverPaise: rupeesToPaise('freeShippingOver'),
      returnWindowDays: num(f, 'returnWindowDays'), reservationMinutes: num(f, 'reservationMinutes'), maxQtyPerLook: num(f, 'maxQtyPerLook'),
      checkoutOpen: bool(f, 'checkoutOpen'), supportEmail: str(f, 'supportEmail'), supportPhone: str(f, 'supportPhone'), announcement: str(f, 'announcement'),
    });
    return 'Settings saved. The storefront picks them up within seconds';
  });
}

// ───────── team ─────────
const role = (v: string): AdminRole => { if (!(ADMIN_ROLES as readonly string[]).includes(v)) throw new ApiError('bad_request', 'Unknown role'); return v as AdminRole; };

/** Credentials are shown once, on the redirect target, through a short-lived HttpOnly cookie rather than the URL. */
async function stashCredentials(c: { email: string; password: string; totpSecret: string; otpauthUri: string }) {
  (await cookies()).set('sd_cred', encryptSecret(JSON.stringify(c)), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/admin/team', maxAge: 120 });
}

export async function createAdminAction(f: FormData) {
  const ctx = await requireAdmin('team.manage');
  return run('/admin/team', async () => { await stashCredentials(await createAdminUser(db(), ctx, { email: str(f, 'email'), name: str(f, 'name'), role: role(str(f, 'role')) })); return 'Team member created. Share the sign-in details below, once'; });
}
export async function resetAdminAction(f: FormData) {
  const ctx = await requireAdmin('team.manage');
  return run('/admin/team', async () => { await stashCredentials(await resetAdminCredentials(db(), ctx, uuid(str(f, 'id')))); return 'Credentials reset. Share the new sign-in details below, once'; });
}
export async function updateAdminAction(f: FormData) {
  const ctx = await requireAdmin('team.manage');
  return run('/admin/team', async () => {
    const patch: { role?: AdminRole; active?: boolean } = {};
    if (f.get('role')) patch.role = role(str(f, 'role'));
    if (f.get('active')) patch.active = str(f, 'active') === '1';
    await updateAdmin(db(), ctx, uuid(str(f, 'id')), patch);
    return 'Updated';
  });
}


export async function uploadImageAction(f: FormData) {
  const ctx = await requireAdmin('catalog.write');
  const kind = kindOf(str(f, 'kind')); const id = str(f, 'id');
  const file = f.get('photo');
  return run(`/admin/catalog/${kind}/${id}`, async () => {
    if (!(file instanceof File) || file.size === 0) throw new ApiError('bad_request', 'Choose a photo to upload');
    await addProductImage(db(), ctx, kind, id, new Uint8Array(await file.arrayBuffer()));
    return 'Photo added. Reorder by editing the Images list below';
  });
}
