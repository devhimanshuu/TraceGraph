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
        <span className="bg-gradient-to-r from-sky-400 via-sky-300 to-indigo-400 bg-clip-text text-[15px] font-bold tracking-wide text-transparent">
          TraceGraph
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          codebase intelligence
        </span>
      </span>
    </Link>
  );
}
