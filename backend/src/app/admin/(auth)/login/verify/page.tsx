import { verifyAction } from '../../../actions';
import { Flash, one, type SP } from '../../../ui';

export default async function Verify({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return (
    <div className="authwrap"><div className="authcard">
      <h1>Two-step check</h1><p className="sub">Enter the 6-digit code from your authenticator app.</p>
      <Flash err={one(sp.err)} />
      <form action={verifyAction}>
        <div className="field"><label htmlFor="code">Code</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus /></div>
        <div className="actions"><button className="btn" type="submit">Sign in</button><a className="btn ghost" href="/admin/login">Start over</a></div>
      </form>
    </div></div>
  );
}
