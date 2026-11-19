import { cookies } from 'next/headers';
import { db } from '@/db/client';
import { decryptSecret } from '@/lib/crypto';
import { ADMIN_ROLES } from '@/db/schema';
import { requireAdmin } from '@/admin/session';
import { can } from '@/lib/rbac';
import { label, when } from '@/admin/format';
import { listAdmins } from '@/services/admin-users';
import { changePasswordAction, createAdminAction, resetAdminAction, updateAdminAction } from '../../actions';
import { Badge, Field, Flash, Head, one, type SP } from '../../ui';

export const dynamic = 'force-dynamic';

type Cred = { email: string; password: string; totpSecret: string; otpauthUri: string };

export default async function Team({ searchParams }: { searchParams: SP }) {
  const ctx = await requireAdmin();
  const sp = await searchParams;
  const manage = can(ctx.role, 'team.manage');
  const admins = manage ? await listAdmins(db(), ctx) : [];
  // Shown once: read from a 2-minute HttpOnly cookie that is not part of any URL, then forgotten by expiry.
  let cred: Cred | null = null;
  const raw = (await cookies()).get('sd_cred')?.value;
  if (manage && raw) { try { cred = JSON.parse(decryptSecret(raw)) as Cred; } catch { cred = null; } }

  return (
    <>
      <Head title="Team" sub={manage ? 'Everyone who can sign in. Each person needs a password and an authenticator app.' : 'Your account'} />
      <Flash ok={one(sp.ok)} err={one(sp.err)} />
      {cred ? (
        <div className="card" style={{ borderColor: 'var(--gold)' }}><h2>Sign-in details for {cred.email}</h2>
          <p className="warn">Copy these now. They disappear after 2 minutes and cannot be shown again.</p>
          <p>Password</p><div className="secret">{cred.password}</div>
          <p>Authenticator key (add to Google Authenticator, Authy or 1Password)</p><div className="secret">{cred.totpSecret}</div>
          <p className="sub">Or scan/open: <span style={{ wordBreak: 'break-all' }}>{cred.otpauthUri}</span></p></div>) : null}
      {manage ? (<>
        <div className="card tablewrap">
          <table><thead><tr><th>Person</th><th>Role</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
            <tbody>{admins.map((a) => (
              <tr key={a.id}><td>{a.name}<div className="sub">{a.email}</div></td>
                <td><form action={updateAdminAction} className="actions"><input type="hidden" name="id" value={a.id} /><select name="role" defaultValue={a.role} aria-label={`Role for ${a.email}`} style={{ width: 120 }}>{ADMIN_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select><button className="btn ghost sm" type="submit">Change</button></form></td>
                <td>{when(a.lastLoginAt)}</td><td><Badge v={a.active ? 'active' : 'archived'} />{a.lockedUntil && a.lockedUntil > new Date() ? <span className="badge b-failed">Locked</span> : null}</td>
                <td><div className="actions">
                  <form action={updateAdminAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value={a.active ? '0' : '1'} /><button className="btn ghost sm" type="submit">{a.active ? 'Deactivate' : 'Reactivate'}</button></form>
                  <form action={resetAdminAction}><input type="hidden" name="id" value={a.id} /><button className="btn ghost sm" type="submit">Reset sign-in</button></form></div></td></tr>))}</tbody></table>
        </div>
        <form action={createAdminAction} className="card"><h2>Add a team member</h2>
          <div className="row"><Field name="name" label="Name"><input id="name" name="name" required maxLength={80} /></Field><Field name="email" label="Email"><input id="email" name="email" type="email" required maxLength={200} /></Field>
            <Field name="role" label="Role"><select id="role" name="role" defaultValue="staff"><option value="staff">Staff: orders and stock</option><option value="manager">Manager: plus catalogue, refunds, promos</option><option value="owner">Owner: everything</option></select></Field></div>
          <button className="btn" type="submit">Create</button></form>
      </>) : null}
      <form action={changePasswordAction} className="card" style={{ maxWidth: 460 }}><h2>Change my password</h2>
        <Field name="current" label="Current password"><input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
        <Field name="next" label="New password" hint="at least 12 characters"><input id="next" name="next" type="password" autoComplete="new-password" required minLength={12} /></Field>
        <Field name="confirm" label="Repeat new password"><input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} /></Field>
        <button className="btn" type="submit">Change password</button></form>
    </>
  );
}
