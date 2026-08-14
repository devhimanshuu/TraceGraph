'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { SearchResultItem } from '@tracegraph/shared';
import { graphService } from '@/lib/services/graph.service';

export function useSearch(query: string, debounceMs = 250) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    let ignore = false;
    const handler = setTimeout(async () => {
      setLoading(true);
      try {
        const token = await getTokenRef.current();
        const items = await graphService.search(trimmed, 15, token);
        if (!ignore) {
          setResults(items);
        }
      } catch {
        if (!ignore) {
          setResults([]);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      ignore = true;
      clearTimeout(handler);
    };
  }, [query, debounceMs]);

  const activeResults = query.trim() ? results : [];

  return { results: activeResults, loading: query.trim() ? loading : false };
}
