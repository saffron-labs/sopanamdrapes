import { NextResponse, type NextRequest } from 'next/server';

/** Optimistic gate: no admin cookie, no admin pages. Real authorisation happens in requireAdmin() on every page and action. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = pathname.startsWith('/admin/login') || req.cookies.has('sd_admin') || req.cookies.has('__Host-sd_admin')
    ? NextResponse.next()
    : NextResponse.redirect(new URL('/admin/login', req.url));
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export const config = { matcher: ['/admin/:path*'] };
