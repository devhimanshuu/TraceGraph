import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GitHubSessionProvider } from '@/components/auth/github-session-provider';
import './globals.css';

// Brand typefaces — Bitcount Prop Single (headings/display, variable 100–900)
// and Turret Road (UI/body). Loaded via the Google Fonts @import in globals.css
// so the family names are available to the Tailwind theme tokens.

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
    <html lang="en" className="dark h-full antialiased">
      <body className="flex min-h-full flex-col">
        <GitHubSessionProvider>{children}</GitHubSessionProvider>
      </body>
    </html>
  );
}
