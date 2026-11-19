import { z } from 'zod';
import { route, json, sessionCookie } from '@/lib/http';
import { verifyOtp } from '@/services/auth';

export const POST = route({ body: z.object({ phone: z.string().max(20), code: z.string().max(6) }).strict(), limit: { name: 'otp-verify', max: 40, windowSec: 900 } },
  async ({ db, body, ip, ua }) => {
    const s = await verifyOtp(db, body.phone, body.code, { ip, ua });
    // The token only ever travels in the HttpOnly cookie, never in the JSON body.
    return json({ customer: s.customer, isNew: s.isNew }, 200, { 'Set-Cookie': sessionCookie(s.token, s.expiresAt) });
  });
