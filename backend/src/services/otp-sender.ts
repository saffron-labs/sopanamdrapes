import { env } from '@/lib/env';
import { ApiError } from '@/lib/errors';

// Delivery of one-time codes. Drivers are chosen by OTP_DRIVER.
//
// NOTE for go-live: SMS in India needs DLT registration (sender ID + template) which takes days.
// A WhatsApp authentication template avoids DLT but needs a verified Meta business. Verify the
// request shapes below against the provider's current docs when credentials are available.

export type OtpSender = (phoneE164: string, code: string) => Promise<void>;

const consoleSender: OtpSender = async (phone, code) => {
  if (env().NODE_ENV === 'production') throw new Error('Console OTP driver is disabled in production');
  console.info(`[otp:dev] ${phone} -> ${code}`);
};

const msg91Sender: OtpSender = async (phone, code) => {
  const { MSG91_AUTH_KEY: key, MSG91_TEMPLATE_ID: tpl } = env();
  if (!key || !tpl) throw new Error('MSG91 is not configured');
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', tpl);
  url.searchParams.set('mobile', phone.replace('+', ''));
  url.searchParams.set('otp', code);
  const res = await fetch(url, { method: 'POST', headers: { authkey: key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`MSG91 ${res.status}`);
};

const whatsappSender: OtpSender = async (phone, code) => {
  const { WHATSAPP_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: id, WHATSAPP_OTP_TEMPLATE: tpl } = env();
  if (!token || !id || !tpl) throw new Error('WhatsApp is not configured');
  const res = await fetch(`https://graph.facebook.com/v21.0/${id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: phone.replace('+', ''), type: 'template',
      template: {
        name: tpl, language: { code: 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}`);
};

let override: OtpSender | undefined;
export function setOtpSender(s: OtpSender | undefined) {
  override = s;
}

export async function sendOtp(phone: string, code: string): Promise<void> {
  const send = override ?? { console: consoleSender, msg91: msg91Sender, whatsapp: whatsappSender }[env().OTP_DRIVER];
  try {
    await send(phone, code);
  } catch (e) {
    console.error('[otp] delivery failed', e instanceof Error ? e.message : e);
    throw new ApiError('internal', 'We could not send the code. Please try again in a moment');
  }
}
