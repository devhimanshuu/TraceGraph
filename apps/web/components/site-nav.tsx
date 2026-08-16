'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { GitHubSignInButton } from '@/components/auth/github-sign-in-button';
import { GitHubUserMenu } from '@/components/auth/github-user-menu';
import { useGitHubSession } from '@/hooks/use-github-session';
import { useTheme } from '@/components/theme-provider';
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
  const { theme, toggleTheme } = useTheme();

  // Floating nav: transparent at the top of the page, then a glass pill once
  // the user scrolls. All motion is CSS transitions (reduced-motion safe).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-[padding] duration-300 ${
        scrolled ? 'px-3 pt-2.5 sm:px-4' : 'px-0 pt-0'
      }`}
    >
      <div
        className={`relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 rounded-2xl px-5 transition-all duration-300 sm:h-16 sm:px-6 ${
          scrolled
            ? 'border border-sky-400/20 bg-background/75 shadow-lg shadow-black/20 backdrop-blur-xl'
            : 'border-transparent bg-transparent shadow-none backdrop-blur-none'
        }`}
      >
        {/* Sky hairline — echoes the hero and impact-card glow once floating */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent transition-opacity duration-300 ${
            scrolled ? 'opacity-100' : 'opacity-0'
          }`}
        />
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
          {/* Theme toggle — dark is the default look; light is opt-in. */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            className="flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground transition-colors duration-200 hover:border-sky-400/40 hover:text-foreground"
          >
            {theme === 'dark' ? (
              <Sun className="size-4" aria-hidden />
            ) : (
              <Moon className="size-4" aria-hidden />
            )}
          </button>

          {isSignedIn ? (
            <>
              <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href="/dashboard">
                Dashboard
              </Link>
              {/* Compact avatar pill matching the header's control size; the
                  popup opens downward from the top-of-page header. */}
              <GitHubUserMenu variant="header" />
            </>
          ) : (
            !loading && <GitHubSignInButton label="Get started" size="sm" hideLabelOnMobile />
          )}

          <MobileSiteNav productLinks={productLinks} learnLinks={learnLinks} />
        </div>
      </div>
    </header>
  );
}
