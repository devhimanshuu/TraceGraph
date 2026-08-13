import { cn } from '@/lib/utils';

/**
 * TraceGraph brand mark.
 *
 * A custom SVG, not a generic icon: two code entities feeding a hollow
 * "focus" hub — the selected node and its neighborhood in a code graph.
 * Mirrors the product's core story: pick an entity, follow the relationships.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex size-7 shrink-0 items-center justify-center rounded-lg',
        'bg-gradient-to-br from-sky-500 to-indigo-600',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.3)]',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[62%]">
        {/* relationship edges */}
        <path
          d="M6.5 7 L14.2 10.7"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M19.8 10.7 L8.4 16.1"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.55"
        />
        {/* neighbor nodes */}
        <circle cx="6.5" cy="7" r="2.1" fill="white" />
        <circle cx="6.5" cy="17" r="2.1" fill="white" />
        {/* focused entity (hollow hub) */}
        <circle cx="17" cy="12" r="3.1" stroke="white" strokeWidth="1.6" />
      </svg>
    </span>
  );
}
