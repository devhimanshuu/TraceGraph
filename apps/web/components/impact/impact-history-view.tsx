'use client';

import type { ImpactHistory } from '@tracegraph/shared';
import { HistoryView } from '@/components/dependencies/history-view';

interface ImpactHistoryViewProps {
  history: ImpactHistory;
}

/**
 * Engineering history context for the analyzed entity — the same commit /
 * PR / issue presentation as the Dependency Explorer, fed by the impact
 * response so the report stays self-contained (Phase 9 §17).
 */
export function ImpactHistoryView({ history }: ImpactHistoryViewProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-xs text-muted-foreground">
        Engineering history connected to the analyzed entity — context for judging how actively
        this code changes.
      </p>
      <HistoryView
        commits={history.commits}
        pullRequests={history.pullRequests}
        issues={history.issues}
        loading={false}
        error={null}
        currentLabel="this entity"
      />
    </div>
  );
}
