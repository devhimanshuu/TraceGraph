import type { RepositoryStats } from '@tracegraph/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const ENTITIES = [
  { key: 'files', label: 'Files', color: 'bg-sky-500/80' },
  { key: 'functions', label: 'Functions', color: 'bg-violet-500/80' },
  { key: 'classes', label: 'Classes', color: 'bg-emerald-500/80' },
  { key: 'tests', label: 'Tests', color: 'bg-amber-500/80' },
] as const;

/**
 * Horizontal composition bar — how the codebase splits into files, functions,
 * classes and tests. Percentages are derived from the live stats, nothing is
 * hardcoded.
 */
export function RepositoryComposition({ stats }: { stats: RepositoryStats }) {
  const total = ENTITIES.reduce((sum, e) => sum + stats[e.key], 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Repository composition</CardTitle>
        <CardDescription>
          {total.toLocaleString()} code entities — the shape of the codebase at a glance.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          role="img"
          aria-label="Codebase composition"
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        >
          {ENTITIES.filter((e) => stats[e.key] > 0).map((e) => (
            <div
              key={e.key}
              className={e.color}
              style={{ width: `${(stats[e.key] / Math.max(total, 1)) * 100}%` }}
            />
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {ENTITIES.map((e) => (
            <li key={e.key} className="flex items-center gap-2 text-sm">
              <span aria-hidden className={`size-2.5 rounded-sm ${e.color}`} />
              <span className="tabular-nums font-medium">{stats[e.key].toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">{e.label}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
