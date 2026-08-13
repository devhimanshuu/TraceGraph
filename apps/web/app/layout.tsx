import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geo, Tomorrow } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { SiteNav } from '@/components/site-nav';
import './globals.css';

// Tomorrow — primary UI typeface (full weight range, geometric-tech look).
const tomorrow = Tomorrow({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-tomorrow',
});

// Geo — single-weight display/mono accent (code snippets, technical labels).
const geo = Geo({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-geo',
});

export const metadata: Metadata = {
  title: {
    default: 'TraceGraph — Understand your codebase through relationships',
    template: '%s · TraceGraph',
  },
  description:
    'TraceGraph is a graph-powered codebase intelligence explorer that helps developers understand repository relationships, explore dependencies, and analyze potential change impact.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${tomorrow.variable} ${geo.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ClerkProvider afterSignOutUrl="/">
          <SiteNav />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
