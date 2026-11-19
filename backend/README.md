# Sopanam Drapes: backend and admin

Next.js 16 (App Router) + TypeScript + Postgres (Drizzle). One deployable app that serves the public API (`/api/v1/*`) and the admin panel (`/admin`). The storefront calls the API on the same origin.

## What is in here

| Area | Where | Notes |
| --- | --- | --- |
| Public API | `src/app/api/v1/*` | catalogue, quote, OTP login, profile, addresses, wishlist, orders, cancel/return, payment verify, Razorpay webhook, cron, health |
| Admin panel | `src/app/admin/*` | dashboard, orders, catalogue + photo upload + stock, customers, promo codes, settings, team, activity log |
| Business logic | `src/services/*`, `src/lib/*` | pricing engine, orders, payments, refunds, auth, admin auth, storage |
| Database | `src/db/schema.ts`, `drizzle/*.sql` | migrations include row-level security and append-only triggers |
| Tests | `tests/*` | 91 tests against a real Postgres engine (PGlite) running the real migrations |

## Run locally

```bash
cp .env.example .env            # fill SESSION_PEPPER, DATA_ENC_KEY, DATABASE_URL (see comments)
npm install
npm run db:migrate && npm run db:seed
npm run admin:create -- owner@yourdomain.com "Owner Name" owner   # prints password + 2FA key ONCE
npm run dev                     # http://localhost:3000/admin
npm test && npm run typecheck
```

OTP codes print in the server log while `OTP_DRIVER=console`. Production refuses to start with the console driver.

## Go-live checklist

1. **Supabase**: create the project (Mumbai region), copy the *pooled* connection string into `DATABASE_URL`, create a **public** storage bucket `product-images`, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose it to the browser).
2. **Run `npm run db:migrate` then `npm run db:seed`** against it (use the direct connection string for migrations).
3. **Razorpay**: set `RAZORPAY_KEY_ID/SECRET`; add webhook `https://<domain>/api/v1/webhooks/razorpay` with events `order.paid`, `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`, and put its secret in `RAZORPAY_WEBHOOK_SECRET`.
4. **OTP**: `OTP_DRIVER=msg91` (needs DLT-registered sender and template, which takes days) or `whatsapp` (needs a verified Meta business and an approved authentication template).
5. **Secrets**: `openssl rand -base64 48` for `SESSION_PEPPER`, `openssl rand -base64 32` for `DATA_ENC_KEY`, any 32+ chars for `CRON_SECRET`. Set `TRUST_PROXY=1`, `APP_ORIGIN=https://<domain>`, `STORAGE_DRIVER=supabase`.
6. **Cron**: call `GET /api/v1/cron/maintenance` with `Authorization: Bearer $CRON_SECRET` every 5 minutes (releases stock held by unpaid orders, cleans old sessions).
7. **Create the owner account** with `npm run admin:create`, sign in, add the authenticator key, then create staff from Team.
8. Keep `DATA_ENC_KEY` backed up. Losing it means every admin must have their 2FA reset.

## Security model

- Customers: mobile OTP only, no passwords. Codes and session tokens are stored as HMACs; 5 attempts per code, resend cooldown, per-phone and per-IP limits. HttpOnly, Secure, `__Host-` prefixed cookies.
- Admin: scrypt password + mandatory authenticator code (replay protected), lockout after 5 failures, 30-minute idle and 8-hour absolute sessions, one generic error message, optional `ADMIN_IP_ALLOWLIST`, roles owner / manager / staff, every change in an append-only audit log.
- Prices are always computed on the server from ids. A promo can never make an order free. Stock is reserved atomically; the last piece can only be bought once.
- Payments: signature checked and the payment re-fetched from Razorpay; the webhook is HMAC-verified on the raw body, de-duplicated and idempotent; late payments after expiry are reinstated or auto-refunded.
- Database: row-level security on every table with no policies (so Supabase's public REST API cannot read anything), and triggers that block edits to the audit log, order history and stock ledger.
- CSRF: SameSite cookies, Origin checks on every API write, built-in Origin check on admin Server Actions.
- Uploads: type decided from file bytes (JPG/PNG/WebP only), 5 MB cap, random file names.

## Decisions to confirm with the client

Cash on delivery limit (default ₹5,000), shipping charge (default free), GST and invoices, whether the 10% bundle starts at 2 ornaments, whole-order returns only (no part returns), 7-day return window. All are editable in Admin → Settings.

## Not yet verified (needs real credentials)

Razorpay live calls, MSG91 and WhatsApp request formats, Supabase Storage upload, and email via Resend. They follow the providers' documented APIs and sit behind small adapters, but have only been exercised with test doubles.
