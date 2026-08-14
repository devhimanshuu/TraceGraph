'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AppHealth, DatabaseHealth } from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

export interface HealthState {
  api: AppHealth | null;
  database: DatabaseHealth | null;
  loading: boolean;
  error: string | null;
}

async function fetchHealth(): Promise<{ api: AppHealth; database: DatabaseHealth }> {
  const [api, database] = await Promise.all([
    apiClient.getAppHealth(),
    apiClient.getDatabaseHealth(),
  ]);
  return { api, database };
}

/**
 * Fetches `GET /api/health` and `GET /api/health/database` together and
 * exposes loading / error / retry states.
 */
export function useHealth() {
  const [state, setState] = useState<HealthState>({
    api: null,
    database: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    // Called from user events (e.g. the Retry button), so setting loading
    // synchronously is fine here — only effects must avoid it.
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { api, database } = await fetchHealth();
      setState({ api, database, loading: false, error: null });
    } catch (err) {
      setState({
        api: null,
        database: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { api, database } = await fetchHealth();
        if (!cancelled) {
          setState({ api, database, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            api: null,
            database: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...state, refresh };
}
