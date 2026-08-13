'use client';

import { useHealth } from '@/hooks/use-health';
import { cn } from '@/lib/utils';

/**
 * Subtle graph connectivity indicator. Green when CognoDB answers, red when
 * the API reports it down, gray while checking. Purely informational — never
 * the primary signal for anything.
 */
export function SystemStatus() {
  const { database, loading, error } = useHealth();

  const up = !loading && !error && database?.status === 'up';
  const down = !loading && (Boolean(error) || database?.status === 'down');
  const checking = loading || (!down && !up);

  return (
    <span
      role="status"
      aria-label={up ? 'Graph connected' : down ? 'Graph unavailable' : 'Checking graph status'}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          up && 'bg-emerald-500',
          down && 'bg-red-500',
          checking && 'bg-amber-500',
        )}
      />
      {up ? 'Graph connected' : down ? 'Graph unavailable' : 'Checking…'}
    </span>
  );
}
