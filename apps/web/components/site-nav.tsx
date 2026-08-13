import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { Button, buttonVariants } from '@/components/ui/button';
import { Logo } from '@/components/logo';

/**
 * Top navigation with clear auth controls.
 * Signed out → "Sign in" / "Get started"; signed in → Dashboard + user menu.
 * Server component: auth state via Clerk's server-compatible <Show/>.
 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-wide">
          <Logo />
          TraceGraph
        </Link>

        <nav className="flex items-center gap-2">
          <Show when="signed-in">
            <Link href="/dashboard" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Dashboard
            </Link>
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
              <Button size="sm">Get started</Button>
            </SignUpButton>
          </Show>
        </nav>
      </div>
    </header>
  );
}
