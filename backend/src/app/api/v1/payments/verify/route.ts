import { z } from 'zod';
import { route } from '@/lib/http';
import { confirmClientPayment } from '@/services/payments';

const body = z.object({ orderId: z.string().uuid(), razorpayOrderId: z.string().max(60), razorpayPaymentId: z.string().max(60), razorpaySignature: z.string().max(200) }).strict();
/** The browser callback only speeds up the UI. The signed webhook is the source of truth and is idempotent with this. */
export const POST = route({ auth: 'customer', body, limit: { name: 'pay-verify', max: 30, windowSec: 600 } },
  ({ db, session, body }) => confirmClientPayment(db, session.customerId, body));
