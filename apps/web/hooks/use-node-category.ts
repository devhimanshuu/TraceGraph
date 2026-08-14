'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGitHubSession } from '@/hooks/use-github-session';

export interface NodeCategoryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
}

export function useNodeCategory<T>(
  nodeId: string | null,
  fetcher: (nodeId: string, token: string | null) => Promise<T>,
  enabled = true,
): NodeCategoryState<T> {
  const { getToken } = useGitHubSession();
  const getTokenRef = useRef(getToken);
  const fetcherRef = useRef(fetcher);
  const cacheRef = useRef<Map<string, T>>(new Map());
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    getTokenRef.current = getToken;
    fetcherRef.current = fetcher;
  });

  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    let ignore = false;

    if (!nodeId || !enabled) {
      return;
    }

    // Surface cached data (if any) without refetching unless retry was requested.
    if (retryTrigger === 0) {
      const cached = cacheRef.current.get(nodeId);
      if (cached !== undefined) {
        setState({ data: cached, loading: false, error: null });
        return;
      }
    }

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const token = await getTokenRef.current();
        const result = await fetcherRef.current(nodeId!, token);
        cacheRef.current.set(nodeId!, result);

        if (!ignore) {
          setState({ data: result, loading: false, error: null });
        }
      } catch (err) {
        if (!ignore) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load relationship data',
          });
        }
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [nodeId, enabled, retryTrigger]);

  const retry = useCallback(() => {
    if (nodeId) {
      cacheRef.current.delete(nodeId);
      setRetryTrigger((c) => c + 1);
    }
    return Promise.resolve();
  }, [nodeId]);

  return {
    data: nodeId ? state.data : null,
    loading: nodeId && enabled ? state.loading : false,
    error: nodeId && enabled ? state.error : null,
    retry,
  };
}
