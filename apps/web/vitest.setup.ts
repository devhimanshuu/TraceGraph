import React from 'react';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Ensure each test starts with a clean DOM (vitest runs without globals,
// so testing-library cannot auto-register its own afterEach).
afterEach(() => cleanup());

// Global mocks so component tests don't hit the GitHub session bootstrap or
// the real router.

vi.mock('@/hooks/use-github-session', () => {
  // Stable identity across renders — mirrors the real provider. A fresh
  // getToken per render would retrigger effects that depend on it.
  const getToken = vi.fn().mockResolvedValue('test-token');
  return {
    useGitHubSession: () => ({
      user: { id: 'user_test', login: 'test-user', name: 'Test User', avatarUrl: '' },
      isSignedIn: true,
      loading: false,
      getToken,
      signOut: vi.fn(),
    }),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) =>
    React.createElement('a', { href, ...rest }, children),
}));

vi.mock('@/hooks/use-health', () => ({
  useHealth: () => ({
    api: null,
    database: { status: 'up' as const, latencyMs: 5 },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
