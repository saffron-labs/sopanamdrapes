import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// The admin is server-rendered only; the storefront pages are static files served from /public.
const csp = [
  "default-src 'self'",
  // Razorpay Checkout is loaded by the storefront, not the admin. Storefront CSP is set per-route below.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const baseHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['postgres', '@electric-sql/pglite'],
  async headers() {
    return [
      { source: '/admin/:path*', headers: [...baseHeaders, { key: 'Content-Security-Policy', value: csp }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Cache-Control', value: 'no-store' }] },
      { source: '/api/:path*', headers: [...baseHeaders, { key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default config;
