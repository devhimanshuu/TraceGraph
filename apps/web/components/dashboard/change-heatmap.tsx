'use client';

import { useState, useCallback, useEffect } from 'react';
import { Flame, Loader2 } from 'lucide-react';
import type { ChangeHeatmapResponse } from '@tracegraph/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiResource } from '@/hooks/use-api-resource';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface ChangeHeatmapProps {
  repositoryId: string;
}

function HeatmapSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 rounded" />
        ))}
      </CardContent>
    </Card>
  );
}

function getIntensityColor(intensity: number): string {
  if (intensity > 0.8) return 'bg-red-500/80';
  if (intensity > 0.6) return 'bg-orange-500/70';
  if (intensity > 0.4) return 'bg-amber-500/60';
  if (intensity > 0.2) return 'bg-sky-500/50';
  return 'bg-muted/60';
}

export function ChangeHeatmap({ repositoryId }: ChangeHeatmapProps) {
  const { data, loading, error } = useApiResource<ChangeHeatmapResponse>((token) =>
    apiClient.getChangeHeatmap(repositoryId, 20, token),
  );

  if (loading) return <HeatmapSkeleton />;
  if (error || !data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Flame className="size-4 text-orange-500" aria-hidden />
          Change Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5">
          {data.entries.map((entry) => (
            <div key={entry.path} className="flex items-center gap-2">
              <span className="w-48 truncate text-[11px] font-mono text-muted-foreground">
                {entry.label}
              </span>
              <div className="flex-1 h-4 overflow-hidden rounded bg-muted/30">
                <div
                  className={cn('h-full rounded transition-all duration-500', getIntensityColor(entry.normalizedIntensity))}
                  style={{ width: `${Math.max(entry.normalizedIntensity * 100, 2)}%` }}
                  title={`${entry.changeCount} changes`}
                />
              </div>
              <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                {entry.changeCount}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
