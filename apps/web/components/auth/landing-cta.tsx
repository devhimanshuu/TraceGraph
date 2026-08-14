'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { GitHubSignInButton } from '@/components/auth/github-sign-in-button';
import { useGitHubSession } from '@/hooks/use-github-session';
import { cn } from '@/lib/utils';

interface LandingCtaProps {
  label?: string;
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

/**
 * Landing-page call to action. Signed-out visitors get the GitHub OAuth button;
 * signed-in visitors get a direct link into the app (dashboard → onboarding
 * repo chooser when the graph is empty). Prevents re-running the OAuth flow
 * for users who are already signed in.
 */
export function LandingCta({ label = 'Get started free', size = 'default', className }: LandingCtaProps) {
  const { isSignedIn, loading } = useGitHubSession();

  if (loading) {
    return (
      <span
        aria-hidden
        className={cn(buttonVariants({ size }), 'pointer-events-none opacity-60', className)}
      >
        {label}
      </span>
    );
  }

  if (isSignedIn) {
    return (
      <Link href="/dashboard" className={cn(buttonVariants({ size }), className)}>
        Open the app
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    );
  }

  return <GitHubSignInButton label={label} size={size} className={className} />;
}
