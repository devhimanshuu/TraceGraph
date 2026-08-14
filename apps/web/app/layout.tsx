import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GitHubSessionProvider } from '@/components/auth/github-session-provider';
import { ThemeProvider } from '@/components/theme-provider';
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
    <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint so there's no flash of the
            wrong theme. Dark is the default (the app's designed look); light is
            opt-in via the nav toggle and persisted in localStorage. */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('tg_theme')==='light'){document.documentElement.classList.remove('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <GitHubSessionProvider>{children}</GitHubSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
