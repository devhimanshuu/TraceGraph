import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ImpactResponse } from '@tracegraph/shared';
import { impactService } from '@/lib/services/impact.service';
import { ImpactCompare } from './impact-compare';

const mockUseSearchParams = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('@/lib/services/impact.service', () => ({
  impactService: { getImpact: vi.fn() },
}));

const payment = {
  id: 'class:apps/api/services/payment.service.ts:PaymentService',
  type: 'Class' as const,
  label: 'PaymentService',
};
const checkout = {
  id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
  type: 'Class' as const,
  label: 'CheckoutService',
};
const order = {
  id: 'class:apps/api/services/order.service.ts:OrderService',
  type: 'Class' as const,
  label: 'OrderService',
};

function responseFor(root: typeof payment): ImpactResponse {
  return {
    root,
    depth: 2,
    summary: {
      direct: root.id === payment.id ? 2 : 1,
      indirect: root.id === payment.id ? 2 : 0,
      tests: root.id === payment.id ? 9 : 4,
      commits: 2,
      pullRequests: 1,
      issues: 1,
      maxDepth: 2,
      score: root.id === payment.id ? 'HIGH' : 'MEDIUM',
      scoreReasons:
        root.id === payment.id
          ? ['2 direct and 2 indirect dependents', 'Impact reaches the full 2-hop depth', '9 potentially affected tests']
          : ['1 direct dependent', 'Impact reaches 1 of 2 requested hops', '4 potentially affected tests'],
    },
    directImpact: [
      {
        id: checkout.id,
        type: 'Class',
        label: 'CheckoutService',
        impactType: 'DIRECT',
        distance: 1,
        relationship: 'CALLS',
        reason: 'CheckoutService directly calls ' + root.label + '.',
        path: { nodes: [checkout, root], relTypes: ['CALLS'] },
      },
    ],
    indirectImpact:
      root.id === payment.id
        ? [
            {
              id: order.id,
              type: 'Class',
              label: 'OrderService',
              impactType: 'INDIRECT',
              distance: 2,
              relationship: 'CALLS',
              reason: 'OrderService depends on CheckoutService, which calls PaymentService.',
              path: { nodes: [order, checkout, root], relTypes: ['CALLS', 'CALLS'] },
            },
          ]
        : [],
    tests: [
      {
        id: `test:${root.label}.spec.ts:case`,
        name: `${root.label} behaves`,
        framework: 'jest',
        filePath: `apps/api/services/${root.id.split(':').pop()}.spec.ts`,
        target: { id: `fn:${root.id}:main`, type: 'Function', label: 'main' },
      },
    ],
    history: {
      commits: [],
      pullRequests: [],
      issues: [],
    },
    paths:
      root.id === payment.id
        ? [{ nodes: [order, checkout, root], relTypes: ['CALLS', 'CALLS'] }]
        : [{ nodes: [checkout, root], relTypes: ['CALLS'] }],
  };
}

describe('ImpactCompare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows guidance when no entity A is selected', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    render(<ImpactCompare />);

    expect(screen.getByRole('heading', { name: 'Compare impact reports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pick first entity/i })).toBeInTheDocument();
  });

  it('renders both reports side by side with their entities and scores', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        `nodeA=${encodeURIComponent(payment.id)}&nodeB=${encodeURIComponent(checkout.id)}&depth=2`,
      ),
    );
    vi.mocked(impactService.getImpact).mockImplementation((id) =>
      Promise.resolve(responseFor(id === payment.id ? payment : checkout)),
    );

    render(<ImpactCompare />);

    expect(await screen.findByText('Impact comparison')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CheckoutService' })).toBeInTheDocument();
    expect(screen.getByText('HIGH impact')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM impact')).toBeInTheDocument();
    expect(impactService.getImpact).toHaveBeenCalledTimes(2);
  });

  it('shows a placeholder slot until entity B is picked', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(`nodeA=${encodeURIComponent(payment.id)}&depth=2`),
    );
    vi.mocked(impactService.getImpact).mockResolvedValue(responseFor(payment));

    render(<ImpactCompare />);

    expect(await screen.findByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();
    expect(screen.getByText('Pick a second entity')).toBeInTheDocument();
    expect(impactService.getImpact).toHaveBeenCalledTimes(1);
  });

  it('updates the depth via the URL preserving both nodes', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        `nodeA=${encodeURIComponent(payment.id)}&nodeB=${encodeURIComponent(checkout.id)}&depth=2`,
      ),
    );
    vi.mocked(impactService.getImpact).mockImplementation((id) =>
      Promise.resolve(responseFor(id === payment.id ? payment : checkout)),
    );

    render(<ImpactCompare />);

    await screen.findByText('Impact comparison');
    fireEvent.click(screen.getByRole('button', { name: '3 hops' }));

    expect(mockReplace).toHaveBeenCalledWith(
      `/impact/compare?nodeA=${encodeURIComponent(payment.id)}&nodeB=${encodeURIComponent(checkout.id)}&depth=3`,
    );
  });

  it('swaps entity A and B in the URL', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        `nodeA=${encodeURIComponent(payment.id)}&nodeB=${encodeURIComponent(checkout.id)}&depth=2`,
      ),
    );
    vi.mocked(impactService.getImpact).mockImplementation((id) =>
      Promise.resolve(responseFor(id === payment.id ? payment : checkout)),
    );

    render(<ImpactCompare />);

    await screen.findByText('Impact comparison');
    fireEvent.click(screen.getByRole('button', { name: /Swap/i }));

    expect(mockReplace).toHaveBeenCalledWith(
      `/impact/compare?nodeA=${encodeURIComponent(checkout.id)}&nodeB=${encodeURIComponent(payment.id)}&depth=2`,
    );
  });

  it('shows the error state and retries with a fresh request', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        `nodeA=${encodeURIComponent(payment.id)}&nodeB=${encodeURIComponent(checkout.id)}&depth=2`,
      ),
    );
    vi.mocked(impactService.getImpact)
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementation((id) =>
        Promise.resolve(responseFor(id === payment.id ? payment : checkout)),
      );

    render(<ImpactCompare />);

    expect(await screen.findByText('Could not build the comparison')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    expect(await screen.findByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();
    // First load fires both fetches (A rejects, B resolves) and the retry
    // fires both again — 4 calls total.
    expect(impactService.getImpact).toHaveBeenCalledTimes(4);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
