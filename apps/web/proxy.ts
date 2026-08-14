import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` — same semantics.
 *
 * Route protection for GitHub-only auth: the OAuth callback sets an httpOnly
 * `tg_session` cookie (same name as the API's — apps/api/src/auth/github-auth.guard.ts).
 * The middleware verifies its HS256 signature with the shared SESSION_SECRET
 * and lets the request through; anything else bounces to the landing page.
 *
 * This is UX gating — the real security boundary is the API guard, which
 * fails closed with 401. When SESSION_SECRET is absent here (never in dev),
 * middleware simply can't gate, but the API still protects the data.
 */
const isPublicRoute = (pathname: string): boolean =>
  pathname === '/' ||
  pathname.startsWith('/api') ||
  pathname.startsWith('/icon') ||
  pathname.startsWith('/apple-icon') ||
  pathname.startsWith('/opengraph-image') ||
  // Any file-like path (static assets, images) stays reachable.
  /\.(?:html?|css|js(?:on)?|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$/i.test(
    pathname,
  );

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('tg_session')?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/', request.url));
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files (unless in search params).
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes (Nest hosts them — the matcher keeps parity
    // with the previous Clerk middleware's API passthrough).
    '/(api|trpc)(.*)',
  ],
};
