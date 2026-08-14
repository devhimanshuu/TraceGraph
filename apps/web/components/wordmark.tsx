import Link from 'next/link';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';

/**
 * Premium TraceGraph brand lockup: gradient logo tile + gradient wordmark.
 * Shared by the landing header and the authenticated app shell so the brand
 * reads identically everywhere.
 */
export function Wordmark({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="TraceGraph home"
      className={cn(
        'flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
    >
      <Logo />
      <span className="flex flex-col leading-tight">
        {/* Violet→fuchsia brand gradient — distinct from the sky UI accents
            and theme-aware: rich 500s on light, bright 300s on dark, so the
            wordmark keeps contrast on both. */}
        <span className="bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 bg-clip-text text-[15px] font-bold tracking-wide text-transparent drop-shadow-[0_0_10px_rgba(167,139,250,0.35)] dark:from-violet-400 dark:via-purple-300 dark:to-fuchsia-300 dark:drop-shadow-[0_0_10px_rgba(196,181,253,0.4)]">
          TraceGraph
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-violet-600/80 dark:text-violet-300/70">
          codebase intelligence
        </span>
      </span>
    </Link>
  );
}
