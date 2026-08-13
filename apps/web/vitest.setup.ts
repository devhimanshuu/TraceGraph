import React from 'react';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Ensure each test starts with a clean DOM (vitest runs without globals,
// so testing-library cannot auto-register its own afterEach).
afterEach(() => cleanup());

// Global mocks so component tests don't hit Clerk's network or real router.

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    userId: 'user_test',
    getToken: vi.fn().mockResolvedValue('test-token'),
  }),
  UserButton: () => null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
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
