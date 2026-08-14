'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { GitHubSignInButton } from '@/components/auth/github-sign-in-button';
import { GitHubUserMenu } from '@/components/auth/github-user-menu';
import { useGitHubSession } from '@/hooks/use-github-session';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavGridCard,
  NavLargeItem,
  NavSmallItem,
} from '@/components/ui/navigation-menu';
import { Wordmark } from '@/components/wordmark';
import { MobileSiteNav } from '@/components/mobile-site-nav';
import { learnLinks, productLinks } from '@/lib/nav';

/**
 * Marketing header: premium gradient wordmark, a NavigationMenu with Product
 * (grid) + Learn (list) dropdowns, and clear auth controls. Mobile gets a
 * slide-in sheet with accordion groups.
 */
export function SiteNav() {
  const { isSignedIn, loading } = useGitHubSession();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Wordmark href="/" />

        {/* Desktop navigation */}
        <div className="hidden lg:block">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Product</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid h-full w-full md:grid-cols-[1fr_0.32fr]">
                    <ul className="grid grow gap-3 p-4 md:grid-cols-2 md:border-r">
                      {productLinks.map((link) => (
                        <li key={link.href}>
                          <NavGridCard link={link} />
                        </li>
                      ))}
                    </ul>
                    <ul className="space-y-1 p-4">
                      {learnLinks.map((link) => (
                        <li key={link.href}>
                          <NavSmallItem item={link} href={link.href} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuTrigger>Learn</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-full gap-3 p-4 sm:grid-cols-2">
                    {learnLinks.map((link) => (
                      <li key={link.href}>
                        <NavLargeItem href={link.href} link={link} />
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuLink
                  href="/dashboard"
                  className="cursor-pointer flex-row items-center gap-2 px-4 py-1 text-sm font-medium"
                >
                  Overview
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Auth controls — GitHub-only sign-in */}
        <div className="flex items-center gap-2">
          {isSignedIn ? (
            <>
              <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href="/dashboard">
                Dashboard
              </Link>
              <GitHubUserMenu />
            </>
          ) : (
            !loading && <GitHubSignInButton label="Get started" size="sm" />
          )}

          <MobileSiteNav productLinks={productLinks} learnLinks={learnLinks} />
        </div>
      </div>
    </header>
  );
}
