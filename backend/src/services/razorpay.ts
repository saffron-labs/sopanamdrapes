import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';
import { ApiError } from '@/lib/errors';

// Thin Razorpay REST client (no SDK: fewer dependencies, easy to fake in tests).
// Docs: https://razorpay.com/docs/api/

export type RzpOrder = { id: string; amount: number; currency: string; receipt: string | null; status: string };
export type RzpPayment = {
  id: string; order_id: string | null; amount: number; currency: string; status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method?: string; error_code?: string | null; error_description?: string | null; captured?: boolean;
};
export type RzpRefund = { id: string; payment_id: string; amount: number; status: string };

export interface RazorpayClient {
  createOrder(p: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<RzpOrder>;
  fetchPayment(paymentId: string): Promise<RzpPayment>;
  createRefund(p: { paymentId: string; amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<RzpRefund>;
}

class HttpRazorpay implements RazorpayClient {
  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: secret } = env();
    if (!id || !secret) throw new ApiError('internal', 'Payments are not configured');
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    if (!res.ok) {
      // Log details server-side only; callers get a generic message.
      console.error('[razorpay]', method, path, res.status, text.slice(0, 500));
      throw new ApiError('payment_failed', 'The payment provider could not process this request. Please try again');
    }
    return JSON.parse(text) as T;
  }

  createOrder(p: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
    return this.call<RzpOrder>('POST', '/orders', { amount: p.amountPaise, currency: 'INR', receipt: p.receipt, notes: p.notes });
  }
  fetchPayment(paymentId: string) {
    return this.call<RzpPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`);
  }
  createRefund(p: { paymentId: string; amountPaise: number; receipt: string; notes: Record<string, string> }) {
    return this.call<RzpRefund>('POST', `/payments/${encodeURIComponent(p.paymentId)}/refund`, { amount: p.amountPaise, receipt: p.receipt, notes: p.notes });
  }
}

let client: RazorpayClient = new HttpRazorpay();
export const razorpay = (): RazorpayClient => client;
export function setRazorpayClient(c: RazorpayClient | undefined) {
  client = c ?? new HttpRazorpay();
}

/** Signature returned to the browser by Razorpay Checkout: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = env().RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret). Must be computed over the exact bytes received. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
