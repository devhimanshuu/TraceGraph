'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { RepositoryOverview } from '@tracegraph/shared';
import { apiClient, ApiRequestError } from '@/lib/api-client';

export interface RepositoryState {
  repository: RepositoryOverview | null;
  loading: boolean;
  /** null = no error; 'empty' = graph not seeded yet; otherwise a message. */
  error: string | null;
}

/**
 * Fetches `GET /api/repository` — the query layer's overview endpoint.
 * The Clerk session token is attached so the (fail-closed) API can verify it.
 */
export function useRepository() {
  const { getToken } = useAuth();
  const [state, setState] = useState<RepositoryState>({
    repository: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const token = await getToken();
      const repository = await apiClient.getRepositoryOverview(token);
      setState({ repository, loading: false, error: null });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setState({ repository: null, loading: false, error: 'empty' });
        return;
      }
      setState({
        repository: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const repository = await apiClient.getRepositoryOverview(token);
        if (!cancelled) setState({ repository, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiRequestError && err.status === 404) {
            setState({ repository: null, loading: false, error: 'empty' });
            return;
          }
          setState({
            repository: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return { ...state, refresh };
}
