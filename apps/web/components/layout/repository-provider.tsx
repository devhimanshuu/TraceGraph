'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useRepository, type RepositoryState } from '@/hooks/use-repository';

/**
 * Shares a single `GET /api/repository` fetch across every page in the app
 * shell (dashboard, graph, dependencies, impact). Later phases reuse the same
 * context instead of each page issuing its own overview request.
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
