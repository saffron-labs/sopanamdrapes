import { route, json, clearSessionCookie } from '@/lib/http';
import { logout } from '@/services/auth';

export const POST = route({}, async ({ db, token }) => { await logout(db, token); return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() }); });
