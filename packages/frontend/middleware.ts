import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protected routes require an accessToken cookie (lightweight check - backend verifies JWT)
const PROTECTED_PREFIXES = ['/leagues', '/onboarding'];
// Public auth routes redirect to home if already authenticated
const AUTH_ROUTES = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('accessToken');

  // Protected routes: redirect to /login if no session cookie
  if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    if (!accessToken) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Auth routes: redirect to / if already authenticated
  if (AUTH_ROUTES.some((route) => pathname === route)) {
    if (accessToken) {
      const homeUrl = new URL('/', request.url);
      return NextResponse.redirect(homeUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/leagues/:path*', '/onboarding', '/login', '/signup'],
};
