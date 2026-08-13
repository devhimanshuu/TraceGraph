'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { ApiRequestError } from '@/lib/api-client';

export interface ApiResourceState<T> {
  data: T | null;
  loading: boolean;
  /** null = ok; 'empty' = resource absent (404); otherwise a message. */
  error: string | null;
  refresh: () => Promise<void>;
}

type ResourceState<T> = { data: T | null; loading: boolean; error: string | null };

/**
 * Generic typed fetch-on-mount hook with loading / error / empty / retry
 * semantics, shared by every dashboard data hook so API logic lives in one
 * place. The Clerk session token is attached automatically.
 *
 * The loader and token getter are held in refs so the fetch runs exactly once
 * on mount regardless of whether `getToken` changes identity between renders.
 */
export function useApiResource<T>(loader: (token: string | null) => Promise<T>): ApiResourceState<T> {
  const { getToken } = useAuth();

  const loaderRef = useRef(loader);
  const getTokenRef = useRef(getToken);
  const mountedRef = useRef(true);

  useEffect(() => {
    loaderRef.current = loader;
    getTokenRef.current = getToken;
  });

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [state, setState] = useState<ResourceState<T>>({ data: null, loading: true, error: null });

  const setSafe = useCallback((updater: (prev: ResourceState<T>) => ResourceState<T>) => {
    if (mountedRef.current) setState(updater);
  }, []);

  const run = useCallback(
    async (mount = false) => {
      if (mount) {
        setSafe(() => ({ data: null, loading: true, error: null }));
      } else {
        setSafe((prev) => ({ ...prev, loading: true, error: null }));
      }
      try {
        const token = await getTokenRef.current();
        const data = await loaderRef.current(token);
        setSafe(() => ({ data, loading: false, error: null }));
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          setSafe(() => ({ data: null, loading: false, error: 'empty' }));
          return;
        }
        setSafe(() => ({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }));
      }
    },
    [setSafe],
  );

  useEffect(() => {
    void run(true);
  }, [run]);

  const refresh = useCallback(() => run(false), [run]);

  return { ...state, refresh };
}
