import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` — same semantics.
 *
 * Clerk runs on every matched route; everything except the landing page, the
 * auth pages, and the (separate, NestJS-hosted) API is protected. The
 * dashboard performs its own `auth()` check as a second layer.
 */
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api(.*)',
  // Brand/SEO image routes must stay reachable without a session (crawlers,
  // link unfurls, and favicon fetches never carry auth).
  '/icon(.*)',
  '/apple-icon(.*)',
  '/opengraph-image(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files (unless in search params).
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
    // Clerk's auto-proxy path.
    '/__clerk/:path*',
  ],
};
