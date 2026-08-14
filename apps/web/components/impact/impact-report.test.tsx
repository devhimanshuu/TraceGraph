import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ImpactResponse, TestCoverage } from '@tracegraph/shared';
import { impactService } from '@/lib/services/impact.service';
import { ImpactReport } from './impact-report';

const mockUseSearchParams = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('@/lib/services/impact.service', () => ({
  impactService: { getImpact: vi.fn() },
}));

const root = {
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

const mockTest: TestCoverage = {
  id: 'test:apps/api/services/payment.service.spec.ts:processPayment_succeeds',
  name: 'processPayment succeeds',
  framework: 'jest',
  filePath: 'apps/api/services/payment.service.spec.ts',
  target: { id: 'fn:apps/api/services/payment.service.ts:processPayment', type: 'Function', label: 'processPayment' },
};

const mockResponse: ImpactResponse = {
  root,
  depth: 2,
  summary: {
    direct: 1,
    indirect: 1,
    tests: 1,
    commits: 2,
    pullRequests: 1,
    issues: 1,
    maxDepth: 2,
    score: 'HIGH',
    scoreReasons: [
      '1 direct and 1 indirect dependents',
      'Impact reaches the full 2-hop depth',
      '1 potentially affected test',
    ],
  },
  directImpact: [
    {
      id: checkout.id,
      type: 'Class',
      label: 'CheckoutService',
      impactType: 'DIRECT',
      distance: 1,
      relationship: 'CALLS',
      reason: 'CheckoutService directly calls PaymentService.',
      path: { nodes: [checkout, root], relTypes: ['CALLS'] },
    },
  ],
  indirectImpact: [
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
  ],
  tests: [mockTest],
  history: {
    commits: [
      {
        sha: '8f21ac7',
        message: 'Refactor payment retry logic',
        timestamp: '2026-08-01T00:00:00.000Z',
        branch: 'main',
        author: { username: 'dev', name: 'Dev' },
      },
    ],
    pullRequests: [
      { number: 421, title: 'Add payment retry handling', status: 'merged', createdAt: '2026-08-01T00:00:00.000Z' },
    ],
    issues: [
      { number: 912, title: 'Checkout occasionally times out', status: 'closed', createdAt: '2026-02-20T10:15:00.000Z' },
    ],
  },
  paths: [
    { nodes: [checkout, root], relTypes: ['CALLS'] },
    { nodes: [order, checkout, root], relTypes: ['CALLS', 'CALLS'] },
  ],
};

describe('ImpactReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows guidance when no entity is selected', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    render(<ImpactReport />);

    expect(screen.getByRole('heading', { name: 'Impact Analysis Report' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Impact Analysis/i })).toBeInTheDocument();
  });

  it('renders the static document: masthead, summary, components, paths, tests, history', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService&depth=2'),
    );
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    render(<ImpactReport />);

    // Masthead
    expect(await screen.findByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();
    expect(screen.getByText(/Impact Analysis Report/)).toBeInTheDocument();
    expect(screen.getByText('HIGH impact')).toBeInTheDocument();

    // Summary section
    expect(screen.getByText('1 · Impact summary')).toBeInTheDocument();
    expect(screen.getByText('Direct')).toBeInTheDocument();
    expect(screen.getByText('Why this score?')).toBeInTheDocument();
    expect(screen.getByText('1 direct and 1 indirect dependents')).toBeInTheDocument();

    // Affected components
    expect(screen.getByText('2 · Potentially affected components')).toBeInTheDocument();
    expect(screen.getByText('Direct impact (1)')).toBeInTheDocument();
    expect(screen.getByText('Indirect impact (1)')).toBeInTheDocument();
    expect(screen.getByText('CheckoutService directly calls PaymentService.')).toBeInTheDocument();
    expect(
      screen.getByText('OrderService depends on CheckoutService, which calls PaymentService.'),
    ).toBeInTheDocument();

    // Evidence paths section
    expect(screen.getByText('3 · Evidence paths (affected → … → root)')).toBeInTheDocument();

    // Tests section
    expect(screen.getByText('4 · Potentially affected tests (1)')).toBeInTheDocument();
    expect(screen.getByText('apps/api/services/payment.service.spec.ts')).toBeInTheDocument();
    expect(screen.getByText('processPayment succeeds')).toBeInTheDocument();

    // History section
    expect(screen.getByText('5 · Engineering history')).toBeInTheDocument();
    expect(screen.getByText('Refactor payment retry logic')).toBeInTheDocument();

    // Footer disclaimer + launchpad links
    expect(screen.getByText(/does not claim they will break/i)).toBeInTheDocument();
    const node = encodeURIComponent(mockResponse.root.id);
    expect(screen.getByRole('link', { name: /Open in Graph/i })).toHaveAttribute(
      'href',
      `/graph?node=${node}`,
    );
    expect(screen.getByRole('link', { name: /View Dependencies/i })).toHaveAttribute(
      'href',
      `/dependencies?node=${node}`,
    );
    expect(screen.getByRole('link', { name: /Re-run analysis/i })).toHaveAttribute(
      'href',
      `/impact?node=${node}`,
    );
  });

  it('renders the honest empty state for a leaf entity', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:lib/stripe.client.ts:StripeClient&depth=2'),
    );
    vi.mocked(impactService.getImpact).mockResolvedValue({
      ...mockResponse,
      root: { id: 'class:lib/stripe.client.ts:StripeClient', type: 'Class', label: 'StripeClient' },
      summary: { ...mockResponse.summary, direct: 0, indirect: 0, score: 'LOW' },
      directImpact: [],
      indirectImpact: [],
      paths: [],
    });

    render(<ImpactReport />);

    expect(await screen.findByText('No downstream impact found')).toBeInTheDocument();
    // The phrase also appears in the footer disclaimer, so expect at least one.
    expect(
      screen.getAllByText(/absence from the graph is not proof of absence in reality/i).length,
    ).toBeGreaterThan(0);
  });

  it('shows the error state and retries with a fresh request', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    vi.mocked(impactService.getImpact)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(mockResponse);

    render(<ImpactReport />);

    expect(await screen.findByText('Could not generate the report')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    expect(await screen.findByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();
    expect(impactService.getImpact).toHaveBeenCalledTimes(2);
  });

  it('triggers window.print from the print button', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    render(<ImpactReport />);

    await screen.findByRole('heading', { name: 'PaymentService' });
    fireEvent.click(screen.getByRole('button', { name: /Print \/ Save as PDF/i }));
    expect(printSpy).toHaveBeenCalled();
  });

  it('downloads the markdown export from its button', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService&depth=2'),
    );
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock');
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<ImpactReport />);

    await screen.findByRole('heading', { name: 'PaymentService' });
    fireEvent.click(screen.getByRole('button', { name: /Export MD/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('downloads the JSON export from its button', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService&depth=2'),
    );
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock');
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<ImpactReport />);

    await screen.findByRole('heading', { name: 'PaymentService' });
    fireEvent.click(screen.getByRole('button', { name: /Export JSON/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('copies the report link and confirms it', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService&depth=3'),
    );
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<ImpactReport />);

    await screen.findByRole('heading', { name: 'PaymentService' });
    fireEvent.click(screen.getByRole('button', { name: /Copy report link/i }));

    // jsdom's location is the default test URL, so assert the handler copied
    // the current page URL (which in a real browser is the report route).
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(expect.any(String));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
