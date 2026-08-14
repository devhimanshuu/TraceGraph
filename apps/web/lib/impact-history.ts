import type { ImpactSnapshot } from '@tracegraph/shared';

/**
 * Client-side impact history helpers.
 *
 * Persistence is server-side: snapshots are stored in CognoDB
 * as nodes tied to the repository, shared across devices and users. This
 * module keeps only the presentation helpers; the ledger contract is the
 * shared `ImpactSnapshot` type.
 */

export type { ImpactSnapshot };

/** Compact relative time ("just now", "5m ago", "2h ago", "3d ago"). */
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
