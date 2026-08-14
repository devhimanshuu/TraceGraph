'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { ImpactSnapshot } from '@tracegraph/shared';
import {
  impactHistoryService,
  type RecordImpactSnapshotInput,
} from '@/lib/services/impact-history.service';

/**
 * Impact analysis history, backed by CognoDB snapshot nodes tied to the
 * repository — shared across devices and users (Phase 10). Loads the ledger
 * on mount, records each completed analysis, and supports clearing.
 *
 * Recording is best-effort: if the API is unreachable the analysis itself
 * still renders; history simply doesn't update.
 */
export function useImpactHistory() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const [history, setHistory] = useState<ImpactSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const token = await getTokenRef.current();
        const data = await impactHistoryService.list(50, token);
        if (!ignore) {
          setHistory(data.snapshots);
          setError(null);
        }
      } catch {
        if (!ignore) setError('Could not load impact history');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [refreshTrigger]);

  const recordSnapshot = useCallback(async (snapshot: RecordImpactSnapshotInput) => {
    try {
      const token = await getTokenRef.current();
      const data = await impactHistoryService.record(snapshot, token);
      setHistory(data.snapshots);
      setError(null);
    } catch {
      // Best-effort — the analysis itself already rendered.
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      await impactHistoryService.clear(token);
      setHistory([]);
      setError(null);
    } catch {
      // Best-effort.
    }
  }, []);

  const refresh = useCallback(() => {
    setRefreshTrigger((c) => c + 1);
    return Promise.resolve();
  }, []);

  return { history, loading, error, recordSnapshot, clear, refresh };
}
