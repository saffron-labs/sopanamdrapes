import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { orderItems, orders } from '@/db/schema';
import { env } from '@/lib/env';
import { formatINR } from '@/lib/money';
import { getSettings } from '@/lib/settings';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export type Mail = { to: string; subject: string; html: string };
let outbox: Mail[] | undefined;
/** Tests capture outgoing mail instead of sending it. */
export function captureMail(on: boolean): Mail[] {
  outbox = on ? [] : undefined;
  return outbox ?? [];
}

export async function sendEmail(mail: Mail): Promise<void> {
  if (outbox) { outbox.push(mail); return; }
  const key = env().RESEND_API_KEY;
  if (!key) { console.info(`[mail:dev] to=${mail.to} subject=${mail.subject}`); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env().MAIL_FROM, to: [mail.to], subject: mail.subject, html: mail.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

/** Best effort: a failed email must never fail or roll back an order. */
export async function notifyOrderPlaced(db: Db, orderId: string): Promise<void> {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) return;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const settings = await getSettings(db);
  const rows = items.map((i) => `<tr><td>${esc(i.name)} × ${i.qty}</td><td align="right">${formatINR(i.unitPricePaise * i.qty - i.discountPaise)}</td></tr>`).join('');
  const a = o.address;
  const body = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:auto;color:#1C1412">
      <h2 style="color:#7A1F2B">Order ${esc(o.number)}</h2>
      <table width="100%" cellpadding="6" style="border-collapse:collapse">${rows}
        <tr><td><b>Total</b></td><td align="right"><b>${formatINR(o.totalPaise)}</b></td></tr></table>
      <p>${o.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid online'}</p>
      <p>Deliver to ${esc(a.name)}, ${esc(a.line1)}${a.line2 ? ', ' + esc(a.line2) : ''}, ${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}</p>
    </div>`;
  const jobs: Promise<void>[] = [sendEmail({ to: settings.supportEmail, subject: `New order ${o.number} · ${formatINR(o.totalPaise)}`, html: body })];
  if (o.contactEmail) jobs.push(sendEmail({ to: o.contactEmail, subject: `Your Sopanam Drapes order ${o.number}`, html: `<p style="font-family:Georgia,serif">Thank you for your order.</p>${body}` }));
  await Promise.allSettled(jobs);
}
