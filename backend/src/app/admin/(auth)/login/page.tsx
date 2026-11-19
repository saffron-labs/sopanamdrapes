import { loginAction } from '../../actions';
import { Flash, one, type SP } from '../../ui';

export default async function Login({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return (
    <div className="authwrap"><div className="authcard">
      <h1>Sopanam Admin</h1><p className="sub">Sign in to manage orders and products.</p>
      <Flash err={one(sp.err)} />
      <form action={loginAction}>
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={200} /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} /></div>
        <button className="btn" type="submit">Continue</button>
      </form>
    </div></div>
  );
}
