/**
 * Time-range options for the dashboard's activity feed. `since` is sent to
 * `GET /api/repository/activity` as an ISO-8601 timestamp; `all` omits it so
 * the API returns the newest N regardless of age.
 */
export type ActivityRange = '7d' | '30d' | '90d' | 'all';

export const ACTIVITY_RANGE_OPTIONS: Array<{ value: ActivityRange; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

/** ISO-8601 cutoff for a range, or undefined for "all time". */
export function activitySince(range: ActivityRange): string | undefined {
  if (range === 'all') return undefined;
  const days = Number.parseInt(range, 10);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
