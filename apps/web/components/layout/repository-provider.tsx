'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useRepository, type RepositoryState } from '@/hooks/use-repository';

/**
 * Shares a single `GET /api/repository` fetch across every page in the app
 * shell (dashboard, graph, dependencies, impact), avoiding per-page overview requests.
 */
const RepositoryContext = createContext<RepositoryState | null>(null);

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const state = useRepository();
  return <RepositoryContext.Provider value={state}>{children}</RepositoryContext.Provider>;
}

export function useRepositoryContext(): RepositoryState {
  const state = useContext(RepositoryContext);
  if (!state) {
    throw new Error('useRepositoryContext must be used within <RepositoryProvider>');
  }
  return state;
}
