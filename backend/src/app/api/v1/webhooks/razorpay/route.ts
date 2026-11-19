import { db } from '@/db/client';
import { handleRazorpayWebhook } from '@/services/payments';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request-context';

export const dynamic = 'force-dynamic';
const MAX = 256 * 1024;

// No origin check or cookies: authenticity comes from the HMAC over the RAW body, so the body must not be re-serialised.
export async function POST(req: Request) {
  try {
    await enforceRateLimit(db(), `wh:${clientIp(req.headers)}`, 300, 60);
    const raw = await req.text();
    if (Buffer.byteLength(raw) > MAX) return new Response('too large', { status: 400 });
    const r = await handleRazorpayWebhook(db(), raw, req.headers.get('x-razorpay-signature'), req.headers.get('x-razorpay-event-id'));
    return new Response(r.body, { status: r.status });
  } catch (e) {
    console.error('[webhook] error', e instanceof Error ? e.message : e);
    return new Response('error', { status: 500 }); // 5xx makes Razorpay retry
  }
}
