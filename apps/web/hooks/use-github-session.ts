'use client';

import { createContext, useContext } from 'react';

/** GitHub identity attached to a verified session. */
export interface GitHubSessionUser {
  id: string;
  login: string;
  name: string;
  avatarUrl: string;
}

export interface GitHubSessionValue {
  /** Verified GitHub identity, or null when signed out. */
  user: GitHubSessionUser | null;
  isSignedIn: boolean;
  /** True while the bootstrap (cookie/localStorage validation) is running. */
  loading: boolean;
  /**
   * Returns the session bearer token. Shape-compatible with Clerk's
   * `getToken()` so every existing data hook keeps working unchanged.
   * Stable identity across renders.
   */
  getToken: () => Promise<string | null>;
  /** Revokes the session server-side, clears local state, returns home. */
  signOut: () => Promise<void>;
}

export const GitHubSessionContext = createContext<GitHubSessionValue | null>(null);

/**
 * Access the GitHub session. Must be rendered inside `<GitHubSessionProvider>`
 * (the root layout). Mirrors the `useAuth().getToken` contract the data hooks
 * were written against, so swapping is a one-line change per file.
 */
export function useGitHubSession(): GitHubSessionValue {
  const value = useContext(GitHubSessionContext);
  if (!value) {
    throw new Error('useGitHubSession must be used within <GitHubSessionProvider>.');
  }
  return value;
}
