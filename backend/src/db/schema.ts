import { sql } from 'drizzle-orm';
import {
  bigint, bigserial, boolean, check, date, index, integer, jsonb, pgTable, primaryKey, text,
  timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

// All money is stored as integer paise. Never floats.

export const SLOTS = ['necklace', 'bangles', 'earrings', 'ring', 'anklet', 'bracelet', 'waistband'] as const;
export type Slot = (typeof SLOTS)[number];

export const WORLDS = ['bridal', 'festive', 'celebrations', 'occasions', 'everyday'] as const;
export type World = (typeof WORLDS)[number];

export const ORDER_STATUSES = [
  'pending_payment', 'placed', 'confirmed', 'packed', 'shipped', 'delivered',
  'return_requested', 'returned', 'cancelled', 'closed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'unpaid', 'paid', 'cod_pending', 'cod_collected', 'refund_pending', 'refunded', 'partially_refunded', 'failed',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ADMIN_ROLES = ['owner', 'manager', 'staff'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

// ───────────────────────── Catalogue ─────────────────────────

export const sarees = pgTable('sarees', {
  id: text('id').primaryKey(), // SA00001
  name: text('name').notNull(),
  colour: text('colour').notNull().default(''),
  fabric: text('fabric').notNull().default(''),
  description: text('description').notNull().default(''),
  highlights: text('highlights').array().notNull().default(sql`'{}'::text[]`),
  blouseType: text('blouse_type', { enum: ['unstitched', 'stitched', 'none'] }).notNull().default('unstitched'),
  worlds: text('worlds').array().notNull().default(sql`'{}'::text[]`),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  mrpPaise: integer('mrp_paise').notNull(),
  discountPercent: integer('discount_percent').notNull().default(0),
  discountStartsAt: ts('discount_starts_at'),
  discountEndsAt: ts('discount_ends_at'),
  stock: integer('stock').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  images: text('images').array().notNull().default(sql`'{}'::text[]`),
  specs: jsonb('specs').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  status: text('status', { enum: ['active', 'draft', 'archived'] }).notNull().default('draft'),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check('sarees_mrp_positive', sql`${t.mrpPaise} > 0`),
  check('sarees_discount_range', sql`${t.discountPercent} between 0 and 90`),
  check('sarees_stock_nonneg', sql`${t.stock} >= 0`),
  index('sarees_status_idx').on(t.status),
]);

export const ornaments = pgTable('ornaments', {
  id: text('id').primaryKey(), // OR00001
  slot: text('slot', { enum: SLOTS }).notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  highlights: text('highlights').array().notNull().default(sql`'{}'::text[]`),
  material: text('material').notNull().default('Fashion jewellery'),
  mrpPaise: integer('mrp_paise').notNull(),
  discountPercent: integer('discount_percent').notNull().default(0),
  discountStartsAt: ts('discount_starts_at'),
  discountEndsAt: ts('discount_ends_at'),
  stock: integer('stock').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  images: text('images').array().notNull().default(sql`'{}'::text[]`),
  specs: jsonb('specs').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  status: text('status', { enum: ['active', 'draft', 'archived'] }).notNull().default('draft'),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check('ornaments_mrp_positive', sql`${t.mrpPaise} > 0`),
  check('ornaments_discount_range', sql`${t.discountPercent} between 0 and 90`),
  check('ornaments_stock_nonneg', sql`${t.stock} >= 0`),
  index('ornaments_slot_idx').on(t.slot),
]);

export const defaultLooks = pgTable('default_looks', {
  sareeId: text('saree_id').notNull().references(() => sarees.id, { onDelete: 'cascade' }),
  ornamentId: text('ornament_id').notNull().references(() => ornaments.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.sareeId, t.ornamentId] })]);

// ───────────────────────── Customers ─────────────────────────

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(), // E.164, +91XXXXXXXXXX
  name: text('name').notNull().default(''),
  email: text('email'),
  dob: date('dob'),
  status: text('status', { enum: ['active', 'blocked'] }).notNull().default('active'),
  marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
  createdAt: createdAt(),
  lastLoginAt: ts('last_login_at'),
}, (t) => [check('customers_phone_format', sql`${t.phone} ~ '^\\+91[6-9][0-9]{9}$'`)]);

export const addresses = pgTable('addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default('Home'),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  line1: text('line1').notNull(),
  line2: text('line2').notNull().default(''),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: text('pincode').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  deletedAt: ts('deleted_at'),
  createdAt: createdAt(),
}, (t) => [index('addresses_customer_idx').on(t.customerId)]);

export const wishlist = pgTable('wishlist', {
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  sareeId: text('saree_id').notNull().references(() => sarees.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.customerId, t.sareeId] })]);

export const sessions = pgTable('sessions', {
  idHash: text('id_hash').primaryKey(), // HMAC of the opaque cookie token; the raw token is never stored
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  expiresAt: ts('expires_at').notNull(),
  absoluteExpiresAt: ts('absolute_expires_at').notNull(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  ip: text('ip'),
  userAgent: text('user_agent'),
}, (t) => [index('sessions_customer_idx').on(t.customerId)]);

export const otpChallenges = pgTable('otp_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumedAt: ts('consumed_at'),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('otp_phone_idx').on(t.phone, t.createdAt)]);

// ───────────────────────── Orders ─────────────────────────

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull().unique(), // SD-26-000123
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  status: text('status', { enum: ORDER_STATUSES }).notNull(),
  paymentMethod: text('payment_method', { enum: ['online', 'cod'] }).notNull(),
  paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }).notNull().default('unpaid'),
  mrpTotalPaise: integer('mrp_total_paise').notNull(),
  subtotalPaise: integer('subtotal_paise').notNull(), // after item discounts, before bundle/promo
  bundleDiscountPaise: integer('bundle_discount_paise').notNull().default(0),
  promoCode: text('promo_code'),
  promoDiscountPaise: integer('promo_discount_paise').notNull().default(0),
  shippingPaise: integer('shipping_paise').notNull().default(0),
  codFeePaise: integer('cod_fee_paise').notNull().default(0),
  totalPaise: integer('total_paise').notNull(),
  address: jsonb('address').$type<OrderAddress>().notNull(),
  contactPhone: text('contact_phone').notNull(),
  contactEmail: text('contact_email'),
  razorpayOrderId: text('razorpay_order_id').unique(),
  reservedUntil: ts('reserved_until'),
  idempotencyKey: text('idempotency_key'),
  trackingCarrier: text('tracking_carrier'),
  trackingAwb: text('tracking_awb'),
  shippedAt: ts('shipped_at'),
  deliveredAt: ts('delivered_at'),
  cancelledAt: ts('cancelled_at'),
  cancelReason: text('cancel_reason'),
  customerNote: text('customer_note').notNull().default(''),
  adminNote: text('admin_note').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('orders_idem_idx').on(t.customerId, t.idempotencyKey),
  index('orders_status_idx').on(t.status, t.createdAt),
  index('orders_customer_idx').on(t.customerId, t.createdAt),
  check('orders_total_nonneg', sql`${t.totalPaise} >= 0`),
]);

export type OrderAddress = {
  name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string;
};

export const orderItems = pgTable('order_items', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  lookIndex: integer('look_index').notNull(),
  kind: text('kind', { enum: ['saree', 'ornament'] }).notNull(),
  productId: text('product_id').notNull(),
  name: text('name').notNull(),
  slot: text('slot'),
  mrpPaise: integer('mrp_paise').notNull(),
  unitPricePaise: integer('unit_price_paise').notNull(),
  qty: integer('qty').notNull(),
  discountPaise: integer('discount_paise').notNull().default(0), // allocated bundle discount for the whole line
}, (t) => [index('order_items_order_idx').on(t.orderId), check('order_items_qty', sql`${t.qty} between 1 and 10`)]);

export const orderEvents = pgTable('order_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorType: text('actor_type', { enum: ['customer', 'admin', 'system', 'razorpay'] }).notNull(),
  actorId: text('actor_id'),
  note: text('note').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [index('order_events_order_idx').on(t.orderId, t.createdAt)]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  provider: text('provider', { enum: ['razorpay', 'cod'] }).notNull(),
  providerOrderId: text('provider_order_id'),
  providerPaymentId: text('provider_payment_id').unique(),
  amountPaise: integer('amount_paise').notNull(),
  status: text('status', { enum: ['created', 'captured', 'failed', 'refunded'] }).notNull().default('created'),
  method: text('method'),
  error: jsonb('error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('payments_order_idx').on(t.orderId)]);

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  paymentId: uuid('payment_id').references(() => payments.id),
  amountPaise: integer('amount_paise').notNull(),
  providerRefundId: text('provider_refund_id').unique(),
  status: text('status', { enum: ['initiated', 'processed', 'failed', 'manual'] }).notNull(),
  reason: text('reason').notNull().default(''),
  createdBy: text('created_by').notNull(),
  createdAt: createdAt(),
}, (t) => [index('refunds_order_idx').on(t.orderId), check('refunds_amount_pos', sql`${t.amountPaise} > 0`)]);

export const returnRequests = pgTable('return_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id).unique(),
  reason: text('reason').notNull(),
  status: text('status', { enum: ['requested', 'approved', 'rejected', 'received', 'refunded'] }).notNull().default('requested'),
  adminNote: text('admin_note').notNull().default(''),
  createdAt: createdAt(),
  resolvedAt: ts('resolved_at'),
});

export const webhookEvents = pgTable('webhook_events', {
  eventId: text('event_id').primaryKey(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: ts('received_at').notNull().defaultNow(),
  processedAt: ts('processed_at'),
  error: text('error'),
});

// ───────────────────────── Promotions ─────────────────────────

export const promoCodes = pgTable('promo_codes', {
  code: text('code').primaryKey(), // upper-case
  kind: text('kind', { enum: ['percent', 'flat'] }).notNull(),
  value: integer('value').notNull(), // percent (1-90) or paise
  minSubtotalPaise: integer('min_subtotal_paise').notNull().default(0),
  maxDiscountPaise: integer('max_discount_paise'),
  startsAt: ts('starts_at'),
  endsAt: ts('ends_at'),
  usageLimit: integer('usage_limit'),
  usedCount: integer('used_count').notNull().default(0),
  perCustomerLimit: integer('per_customer_limit').notNull().default(1),
  active: boolean('active').notNull().default(true),
  note: text('note').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [check('promo_value_pos', sql`${t.value} > 0`)]);

export const promoRedemptions = pgTable('promo_redemptions', {
  orderId: uuid('order_id').primaryKey().references(() => orders.id, { onDelete: 'cascade' }),
  code: text('code').notNull().references(() => promoCodes.code),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  createdAt: createdAt(),
}, (t) => [index('promo_redemptions_code_idx').on(t.code, t.customerId)]);

// ───────────────────────── Inventory ─────────────────────────

export const stockMovements = pgTable('stock_movements', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  productKind: text('product_kind', { enum: ['saree', 'ornament'] }).notNull(),
  productId: text('product_id').notNull(),
  delta: integer('delta').notNull(),
  reason: text('reason', { enum: ['initial', 'order', 'cancel', 'expire', 'return', 'adjust'] }).notNull(),
  orderId: uuid('order_id'),
  actor: text('actor').notNull(),
  note: text('note').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [index('stock_movements_product_idx').on(t.productKind, t.productId, t.createdAt)]);

// ───────────────────────── Settings ─────────────────────────

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
  updatedBy: text('updated_by'),
});

// ───────────────────────── Admin ─────────────────────────

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ADMIN_ROLES }).notNull(),
  totpSecretEnc: text('totp_secret_enc'),
  totpLastStep: bigint('totp_last_step', { mode: 'number' }).notNull().default(0),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: ts('locked_until'),
  active: boolean('active').notNull().default(true),
  lastLoginAt: ts('last_login_at'),
  createdAt: createdAt(),
}, (t) => [check('admin_email_lower', sql`${t.email} = lower(${t.email})`)]);

export const adminSessions = pgTable('admin_sessions', {
  idHash: text('id_hash').primaryKey(),
  adminId: uuid('admin_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  stage: text('stage', { enum: ['password', 'full'] }).notNull(),
  createdAt: createdAt(),
  expiresAt: ts('expires_at').notNull(), // absolute
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  ip: text('ip'),
  userAgent: text('user_agent'),
}, (t) => [index('admin_sessions_admin_idx').on(t.adminId)]);

// Append-only. A trigger (see drizzle/*_hardening.sql) rejects UPDATE and DELETE.
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  adminId: uuid('admin_id'),
  adminEmail: text('admin_email').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull().default(''),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
}, (t) => [index('audit_created_idx').on(t.createdAt), index('audit_entity_idx').on(t.entity, t.entityId)]);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').notNull(),
  windowStart: bigint('window_start', { mode: 'number' }).notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] })]);

/** Every table name, for test resets and tooling. */
export const tableNames = [
  'sarees', 'ornaments', 'default_looks', 'customers', 'addresses', 'wishlist', 'sessions', 'otp_challenges', 'orders', 'order_items',
  'order_events', 'payments', 'refunds', 'return_requests', 'webhook_events', 'promo_codes', 'promo_redemptions', 'stock_movements',
  'settings', 'admin_users', 'admin_sessions', 'audit_log', 'rate_limits',
] as const;
