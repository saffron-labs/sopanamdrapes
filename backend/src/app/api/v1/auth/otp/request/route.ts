import { z } from 'zod';
import { route } from '@/lib/http';
import { requestOtp } from '@/services/auth';

export const POST = route({ body: z.object({ phone: z.string().max(20) }).strict(), limit: { name: 'otp-req', max: 20, windowSec: 3600 } },
  ({ db, body, ip }) => requestOtp(db, body.phone, ip));
