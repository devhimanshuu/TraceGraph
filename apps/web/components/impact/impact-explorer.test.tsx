import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GraphNode, ImpactExplanation, ImpactResponse, TestCoverage } from '@tracegraph/shared';
import { impactService } from '@/lib/services/impact.service';
import { aiService } from '@/lib/services/ai.service';
import { ApiRequestError } from '@/lib/api-client';
import { useNode } from '@/hooks/use-node';
import { ImpactExplorer } from './impact-explorer';

const mockUseSearchParams = vi.fn();
const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('@/lib/services/impact.service', () => ({
  impactService: { getImpact: vi.fn() },
}));

const { mockTestsForChange } = vi.hoisted(() => ({
  mockTestsForChange: vi.fn(),
}));

vi.mock('@/lib/services/intelligence.service', () => ({
  intelligenceService: {
    testsForChange: (...args: unknown[]) => mockTestsForChange(...args),
  },
}));

vi.mock('@/lib/services/ai.service', () => ({
  aiService: { explain: vi.fn() },
}));

const { mockFeaturedEntities } = vi.hoisted(() => ({
  mockFeaturedEntities: [
    { id: 'file:src/workspaces.ts', type: 'File' as const, label: 'workspaces.ts', dependents: 29 },
    { id: 'fn:src/app/page.tsx:GET', type: 'Function' as const, label: 'GET', dependents: 8 },
  ],
}));

vi.mock('@/lib/services/repository.service', () => ({
  repositoryService: {
    getFeatured: vi.fn().mockResolvedValue(mockFeaturedEntities),
  },
}));

const { mockHistoryService } = vi.hoisted(() => ({
  mockHistoryService: {
    list: vi.fn(),
    record: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('@/lib/services/impact-history.service', () => ({
  impactHistoryService: mockHistoryService,
}));

const repoRef = { id: 'repo:commerce-platform', type: 'Repository' as const, label: 'commerce-platform' };

/** Default ledger behavior — an empty history with a resolvable repository. */
function defaultLedger() {
  mockHistoryService.list.mockResolvedValue({ repo: repoRef, snapshots: [] });
  mockHistoryService.record.mockResolvedValue({ repo: repoRef, snapshots: [] });
  mockHistoryService.clear.mockResolvedValue({ deleted: 0 });
}

vi.mock('@/hooks/use-node', () => ({
  useNode: vi.fn(),
}));

vi.mock('@/components/dependencies/entity-search-dialog', () => ({
  EntitySearchDialog: () => null,
}));

vi.mock('@/components/impact/impact-graph', () => ({
  ImpactGraph: () => <div data-testid="impact-graph" />,
}));

const mockNode: GraphNode = {
  id: 'class:apps/api/services/payment.service.ts:PaymentService',
  type: 'Class',
  label: 'PaymentService',
  properties: { filePath: 'apps/api/services/payment.service.ts' },
};

const root = { id: mockNode.id, type: 'Class' as const, label: 'PaymentService' };
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

const mockRankedTests = [
  {
    id: 'test:apps/api/services/payment.service.spec.ts:processPayment_succeeds',
    name: 'processPayment succeeds',
    framework: 'jest',
    filePath: 'apps/api/services/payment.service.spec.ts',
    covers: 2,
    directlyCovers: 1,
    risk: 3,
  },
  {
    id: 'test:apps/api/services/checkout.service.spec.ts:checkout_flow',
    name: 'checkout flow',
    framework: 'jest',
    filePath: 'apps/api/services/checkout.service.spec.ts',
    covers: 1,
    directlyCovers: 0,
    risk: 1,
  },
];

const mockResponse: ImpactResponse = {
  root,
  depth: 2,
  summary: {
    direct: 1,
    indirect: 1,
    tests: 1,
    commits: 1,
    pullRequests: 1,
    issues: 1,
    maxDepth: 2,
    score: 'MEDIUM',
    scoreReasons: ['1 direct and 1 indirect dependents'],
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
    pullRequests: [],
    issues: [],
  },
  paths: [],
};

function mockNodeReady() {
  vi.mocked(useNode).mockReturnValue({
    node: mockNode,
    summary: null,
    loading: false,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
}

/** A canned grounded explanation for the AI panel. */
const mockExplanation: ImpactExplanation = {
  summary: 'CheckoutService is directly affected because it calls PaymentService.',
  keyFindings: ['CheckoutService is directly affected'],
  directImpact: ['CheckoutService'],
  indirectImpact: ['OrderService'],
  evidenceReferences: ['E1'],
  confidence: 'high',
  evidence: [
    {
      id: 'E1',
      kind: 'path',
      direction: 'direct',
      description: 'CheckoutService → CALLS → PaymentService',
      label: 'CheckoutService',
      nodes: [checkout.id, root.id],
      relTypes: ['CALLS'],
    },
  ],
  generatedAt: '2026-08-14T12:00:00.000Z',
  model: 'llama-3.3-70b-versatile',
  grounding: { source: 'cognodb-impact-analysis' },
};

describe('ImpactExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultLedger();
    vi.mocked(aiService.explain).mockResolvedValue(mockExplanation);
    mockTestsForChange.mockResolvedValue({
      changed: [{ id: mockNode.id, type: 'Class', label: 'PaymentService' }],
      unresolved: [],
      tests: mockRankedTests,
    });
  });

  it('shows the welcome screen with featured entities when no node is selected', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockNodeReady();
    render(<ImpactExplorer />);

    expect(screen.getByRole('heading', { name: 'Impact Analysis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search codebase symbols/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Graph Explorer/i })).toBeInTheDocument();
    expect(await screen.findByText('workspaces.ts')).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('File · 29 dependents')).toBeInTheDocument();
  });

  it('renders "Entity not found" when the node does not exist', () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:missing:Missing'),
    );
    vi.mocked(useNode).mockReturnValue({
      node: null,
      summary: null,
      loading: false,
      error: 'empty',
      refresh: vi.fn().mockResolvedValue(undefined),
    });

    render(<ImpactExplorer />);

    expect(screen.getByText('Entity not found')).toBeInTheDocument();
  });

  it('loads and renders summary metrics plus direct and indirect results', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    render(<ImpactExplorer />);

    expect(await screen.findByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();
    expect(screen.getByText('Impact summary')).toBeInTheDocument();
    expect(screen.getByText('Direct impact (1)')).toBeInTheDocument();
    expect(screen.getByText('Indirect impact (1)')).toBeInTheDocument();
    expect(screen.getByTestId('impact-graph')).toBeInTheDocument();
    expect(screen.getByTestId('impact-score')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(impactService.getImpact).toHaveBeenCalledWith(
      mockNode.id,
      { depth: 2, limit: 100 },
      'test-token',
    );
  });

  it('filters to the Tests tab and shows the directlyCovers-weighted ranking', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });
    fireEvent.click(screen.getByRole('tab', { name: /Tests\s*1/ }));

    // Ranked list renders with coverage facts + risk tier.
    expect(await screen.findByTestId('ranked-tests-list')).toBeInTheDocument();
    expect(screen.getByText('processPayment succeeds')).toBeInTheDocument();
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
    expect(screen.getByText(/covers 2 · 1 direct/)).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    expect(screen.getByText('LOW')).toBeInTheDocument();

    expect(mockTestsForChange).toHaveBeenCalledWith(
      [mockNode.id],
      { depth: 2 },
      'test-token',
    );
  });

  it('falls back to the plain deduped test list when the ranking fails', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);
    mockTestsForChange.mockRejectedValue(new Error('ranking unavailable'));

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });
    fireEvent.click(screen.getByRole('tab', { name: /Tests\s*1/ }));

    // Graceful degradation: the plain TESTS-relationship list still renders.
    expect(await screen.findByText('processPayment succeeds')).toBeInTheDocument();
    expect(screen.queryByTestId('ranked-tests-list')).not.toBeInTheDocument();
  });

  it('renders the path explorer when an entity is selected', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Why impacted?' })[0]);

    expect(screen.getByText('Why is this impacted?')).toBeInTheDocument();
    expect(screen.getByText('Root')).toBeInTheDocument();
  });

  it('shows the honest empty state when no impact is found', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue({
      ...mockResponse,
      summary: { ...mockResponse.summary, direct: 0, indirect: 0 },
      directImpact: [],
      indirectImpact: [],
    });

    render(<ImpactExplorer />);

    expect(await screen.findByText('No downstream impact found')).toBeInTheDocument();
    expect(
      screen.getByText(/absence from the graph is not proof of absence in reality/i),
    ).toBeInTheDocument();
  });

  it('shows the error state and retries with a fresh request', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(mockResponse);

    render(<ImpactExplorer />);

    expect(await screen.findByText('Impact analysis failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    expect(await screen.findByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();
    expect(screen.getAllByText('CheckoutService').length).toBeGreaterThan(0);
    expect(impactService.getImpact).toHaveBeenCalledTimes(2);
  });

  it('offers a sign-in-again recovery path when the session expired (not a dead-end retry)', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockRejectedValue(
      new Error('Your session is invalid or has expired. Please sign in again.'),
    );

    render(<ImpactExplorer />);

    expect(await screen.findByText('Impact analysis failed')).toBeInTheDocument();
    // The real API message surfaces (not the generic fallback) so the auth
    // marker is detected and the recovery link replaces the useless Retry.
    expect(screen.getByText(/session is invalid or has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign in again/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument();
  });

  it('renders the AI explanation panel alongside the deterministic results', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });

    // Deterministic results stay visible…
    expect(screen.getByText('Impact summary')).toBeInTheDocument();
    expect(screen.getByTestId('impact-graph')).toBeInTheDocument();
    // …and the grounded AI explanation renders with its evidence.
    expect(await screen.findByTestId('ai-explanation')).toBeInTheDocument();
    expect(
      screen.getByText('CheckoutService is directly affected because it calls PaymentService.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Highlight evidence E1:/ }),
    ).toBeInTheDocument();
    expect(aiService.explain).toHaveBeenCalledWith(mockNode.id, 2, 'test-token');
  });

  it('scrolls the graph into view and opens the full chain on an evidence chip click', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    // jsdom lacks scrollIntoView entirely — install an observable one.
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });
    fireEvent.click(
      await screen.findByRole('button', { name: /Highlight evidence E1:/ }),
    );

    // The graph section is scrolled back into view…
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    // …and the anchor selection opens the full evidence chain (the AI chip's
    // E1 is CheckoutService, a direct entity: CheckoutService → PaymentService).
    expect(screen.getByText('Why is this impacted?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CheckoutService' })).toBeInTheDocument();
    expect(screen.getByText('Root')).toBeInTheDocument();
  });

  it('auto-expands the AI explanation when deep-linked with ?explain=1', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        'node=class:apps/api/services/payment.service.ts:PaymentService&explain=1',
      ),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });

    // The AI section is scrolled into view (it sits below the graph)…
    await vi.waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' }),
    );
    // …and gets a one-shot highlight ring so the narrative can't be missed.
    await vi.waitFor(() =>
      expect(screen.getByTestId('ai-section').className).toContain('ring-sky-500/60'),
    );
  });

  it('keeps deterministic results intact when AI fails (AI_UNAVAILABLE)', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);
    vi.mocked(aiService.explain).mockRejectedValue(
      new ApiRequestError('AI provider is unreachable', 502, 'AI_UNAVAILABLE'),
    );

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });

    // Deterministic analysis is untouched…
    expect(screen.getByText('Impact summary')).toBeInTheDocument();
    expect(screen.getByTestId('impact-graph')).toBeInTheDocument();
    expect(screen.getByText('Direct impact (1)')).toBeInTheDocument();
    expect(screen.getByText('Indirect impact (1)')).toBeInTheDocument();
    // …and the AI section shows its own failure state with a retry.
    expect(await screen.findByTestId('ai-explanation-error')).toBeInTheDocument();
    expect(
      screen.getByText(/The deterministic impact analysis is still available/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry explanation/i })).toBeInTheDocument();
  });

  it('keeps deterministic results intact when AI is disabled (AI_DISABLED)', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);
    vi.mocked(aiService.explain).mockRejectedValue(
      new ApiRequestError('AI explanation is disabled.', 503, 'AI_DISABLED'),
    );

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });

    expect(screen.getByText('Impact summary')).toBeInTheDocument();
    expect(screen.getByTestId('impact-graph')).toBeInTheDocument();
    expect(await screen.findByTestId('ai-explanation-disabled')).toBeInTheDocument();
    expect(
      screen.getByText('AI explanation is unavailable in this environment.'),
    ).toBeInTheDocument();
  });

  it('records the completed analysis to history and revisits it from the list', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    // The ledger records the completed run (server assigns id/timestamp/repo).
    mockHistoryService.record.mockImplementation(async (snapshot) => ({
      repo: repoRef,
      snapshots: [
        {
          ...snapshot,
          id: 'snap-1',
          timestamp: Date.now(),
          repoId: repoRef.id,
          repoName: repoRef.label,
          analyzedBy: null,
        },
      ],
    }));

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });

    // Open the history panel — the completed run is listed with its meta.
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    const panel = screen.getByTestId('impact-history-panel');
    expect(within(panel).getByText('PaymentService')).toBeInTheDocument();
    expect(within(panel).getByText('2 hops · 1 direct · 1 indirect · 1 tests')).toBeInTheDocument();

    // Clicking the row revisits that analysis at its recorded depth.
    fireEvent.click(
      within(panel).getByRole('button', { name: /2 hops · 1 direct · 1 indirect · 1 tests/ }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      `/impact?node=${encodeURIComponent(mockNode.id)}&depth=2`,
    );
  });

  it('diffs two history runs by jumping into the compare view', async () => {
    // The ledger already holds two versions of the same entity (2 hops and
    // 3 hops); recording the current analysis refreshes, not duplicates.
    const snapshotV2 = {
      id: 'snap-2',
      nodeId: mockNode.id,
      label: 'PaymentService',
      type: 'Class' as const,
      depth: 2,
      score: 'MEDIUM' as const,
      direct: 1,
      indirect: 1,
      tests: 1,
      timestamp: 100,
      repoId: repoRef.id,
      repoName: repoRef.label,
      analyzedBy: null,
    };
    const snapshotV3 = { ...snapshotV2, id: 'snap-3', depth: 3, timestamp: 200 };
    mockHistoryService.list.mockResolvedValue({ repo: repoRef, snapshots: [snapshotV3, snapshotV2] });
    mockHistoryService.record.mockResolvedValue({ repo: repoRef, snapshots: [snapshotV3, snapshotV2] });

    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    render(<ImpactExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    const panel = screen.getByTestId('impact-history-panel');

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Compare PaymentService (2 hops)' }),
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Compare PaymentService (3 hops)' }),
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Compare' }));

    // A is the first pick, B the second; depth resolves to the deeper run so
    // neither analysis is truncated by the shared compare depth.
    expect(mockPush).toHaveBeenCalledWith(
      `/impact/compare?nodeA=${encodeURIComponent(mockNode.id)}&nodeB=${encodeURIComponent(mockNode.id)}&depth=3`,
    );
  });

  it('updates the depth via the URL', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        'node=class:apps/api/services/payment.service.ts:PaymentService&depth=3',
      ),
    );
    mockNodeReady();
    vi.mocked(impactService.getImpact).mockResolvedValue(mockResponse);

    render(<ImpactExplorer />);

    expect(
      await screen.findByText((content) =>
        typeof content === 'string' && content.includes('Analyzed up to 3 hops'),
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '1 hop' }));
    expect(mockReplace).toHaveBeenCalledWith(
      `/impact?node=${encodeURIComponent(mockNode.id)}&depth=1`,
    );
  });
});
