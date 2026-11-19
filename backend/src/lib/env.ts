import { z } from 'zod';

const bool = z.enum(['0', '1', 'true', 'false']).transform((v) => v === '1' || v === 'true');
const csv = z.string().transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: csv.default([]),
  TRUST_PROXY: bool.default(false),
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_PEPPER: z.string().min(32, 'SESSION_PEPPER must be at least 32 characters'),
  DATA_ENC_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  OTP_DRIVER: z.enum(['console', 'msg91', 'whatsapp']).default('console'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_OTP_TEMPLATE: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Sopanam Drapes <care@sopanamdrapes.com>'),
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default('product-images'),
  ADMIN_IP_ALLOWLIST: csv.default([]),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validates once, throws a readable error listing every bad variable. */
export function env(): Env {
  if (cached) return cached;
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '' && v !== undefined));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!e.DATABASE_URL) missing.push('DATABASE_URL');
    if (!e.DATA_ENC_KEY) missing.push('DATA_ENC_KEY');
    if (!e.CRON_SECRET) missing.push('CRON_SECRET');
    if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET || !e.RAZORPAY_WEBHOOK_SECRET) missing.push('RAZORPAY_*');
    if (e.OTP_DRIVER === 'console') missing.push('OTP_DRIVER (console is dev-only)');
    if (!e.TRUST_PROXY) missing.push('TRUST_PROXY=1 (needed behind Vercel so rate limits see the real client IP)');
    if (e.STORAGE_DRIVER !== 'supabase' || !e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) missing.push('STORAGE_DRIVER=supabase + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server disk is not permanent)');
    if (e.SESSION_PEPPER.startsWith('change-me')) missing.push('SESSION_PEPPER (still the example value)');
    if (!e.APP_ORIGIN.startsWith('https://')) missing.push('APP_ORIGIN (must be https in production)');
    if (missing.length) throw new Error(`Production configuration incomplete: ${missing.join(', ')}`);
  }
  cached = e;
  return e;
}

export function resetEnvCache() {
  cached = undefined;
}
