'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGitHubSession } from '@/hooks/use-github-session';
import type { GraphNode, RelationshipSummary } from '@tracegraph/shared';
import { ApiRequestError } from '@/lib/api-client';
import { nodeService } from '@/lib/services/node.service';

export interface NodeState {
  node: GraphNode | null;
  summary: RelationshipSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useNode(nodeId: string | null): NodeState {
  const { getToken } = useGitHubSession();
  const getTokenRef = useRef(getToken);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const [state, setState] = useState<{
    node: GraphNode | null;
    summary: RelationshipSummary | null;
    loading: boolean;
    error: string | null;
  }>({
    node: null,
    summary: null,
    loading: Boolean(nodeId),
    error: null,
  });

  useEffect(() => {
    let ignore = false;

    if (!nodeId) {
      return;
    }

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const token = await getTokenRef.current();
        const [node, summary] = await Promise.all([
          nodeService.getNode(nodeId!, token),
          nodeService.getRelationshipSummary(nodeId!, token).catch(() => ({
            relationships: 0,
            dependencies: 0,
            dependents: 0,
            callers: 0,
            callees: 0,
            tests: 0,
            commits: 0,
            pullRequests: 0,
            issues: 0,
          })),
        ]);

        if (!ignore) {
          setState({ node, summary, loading: false, error: null });
        }
      } catch (err) {
        if (ignore) return;
        if (err instanceof ApiRequestError && err.status === 404) {
          setState({ node: null, summary: null, loading: false, error: 'empty' });
          return;
        }
        setState({
          node: null,
          summary: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [nodeId, refreshTrigger]);

  const refresh = useCallback(() => {
    setRefreshTrigger((c) => c + 1);
    return Promise.resolve();
  }, []);

  return {
    node: nodeId ? state.node : null,
    summary: nodeId ? state.summary : null,
    loading: nodeId ? state.loading : false,
    error: nodeId ? state.error : null,
    refresh,
  };
}
