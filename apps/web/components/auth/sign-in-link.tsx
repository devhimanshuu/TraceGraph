import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { githubLoginUrl } from '@/lib/api-client';

/**
 * Recovery action for expired/invalid sessions: restarts the GitHub OAuth
 * flow. After re-authentication the callback lands straight on /dashboard, so
 * this is the one-click way back into the app from an error state.
 */
export function SignInAgainLink() {
  return (
    <Link href={githubLoginUrl} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      <LogIn className="size-3.5" aria-hidden />
      Sign in again
    </Link>
  );
}
