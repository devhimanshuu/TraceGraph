import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GraphNode, RelationshipSummary } from '@tracegraph/shared';
import { nodeService } from '@/lib/services/node.service';
import { DependencyExplorer } from './dependency-explorer';

const mockUseSearchParams = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('@/lib/services/node.service', () => ({
  nodeService: {
    getNode: vi.fn(),
    getRelationshipSummary: vi.fn(),
    getDependencies: vi.fn(),
    getDependents: vi.fn(),
    getCallers: vi.fn(),
    getCallees: vi.fn(),
    getTests: vi.fn(),
    getCommits: vi.fn(),
    getPullRequests: vi.fn(),
    getIssues: vi.fn(),
    getTraversal: vi.fn(),
  },
}));

const mockNode: GraphNode = {
  id: 'class:apps/api/services/payment.service.ts:PaymentService',
  type: 'Class',
  label: 'PaymentService',
  properties: {
    filePath: 'apps/api/services/payment.service.ts',
  },
};

const mockSummary: RelationshipSummary = {
  relationships: 12,
  dependencies: 2,
  dependents: 2,
  callers: 2,
  callees: 2,
  tests: 4,
  commits: 2,
  pullRequests: 1,
  issues: 1,
};

const mockDeps = [
  {
    id: 'class:packages/database/database.service.ts:DatabaseService',
    type: 'Class' as const,
    label: 'DatabaseService',
    relationshipType: 'CALLS' as const,
  },
  {
    id: 'class:lib/stripe.client.ts:StripeClient',
    type: 'Class' as const,
    label: 'StripeClient',
    relationshipType: 'CALLS' as const,
  },
];

const mockDependents = [
  {
    id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
    type: 'Class' as const,
    label: 'CheckoutService',
    relationshipType: 'CALLS' as const,
  },
  {
    id: 'class:apps/api/services/refund.service.ts:RefundService',
    type: 'Class' as const,
    label: 'RefundService',
    relationshipType: 'CALLS' as const,
  },
];

describe('DependencyExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders welcome screen with featured components when no node is selected', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    render(<DependencyExplorer />);

    expect(screen.getByRole('heading', { name: 'Dependency Explorer' })).toBeInTheDocument();
    expect(
      screen.getByText('Or pick a featured component to inspect'),
    ).toBeInTheDocument();
    expect(screen.getByText('PaymentService')).toBeInTheDocument();
    expect(screen.getByText('CheckoutService')).toBeInTheDocument();
  });

  it('renders selected node and its dependencies when node param is present', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    vi.mocked(nodeService.getNode).mockResolvedValue(mockNode);
    vi.mocked(nodeService.getRelationshipSummary).mockResolvedValue(mockSummary);
    vi.mocked(nodeService.getDependencies).mockResolvedValue(mockDeps);
    vi.mocked(nodeService.getDependents).mockResolvedValue(mockDependents);

    render(<DependencyExplorer />);

    expect(await screen.findByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();
    expect(await screen.findByText('DatabaseService')).toBeInTheDocument();
    expect(screen.getByText('StripeClient')).toBeInTheDocument();
  });

  it('deep-links to the impact page with explain=1 from the quick actions', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    vi.mocked(nodeService.getNode).mockResolvedValue(mockNode);
    vi.mocked(nodeService.getRelationshipSummary).mockResolvedValue(mockSummary);

    render(<DependencyExplorer />);

    await screen.findByRole('heading', { name: 'PaymentService' });

    // The AI hand-off carries ?explain=1 so the impact page auto-expands the
    // explanation instead of landing on the deterministic sections.
    expect(screen.getByRole('link', { name: /Explain impact/i })).toHaveAttribute(
      'href',
      `/impact?node=${encodeURIComponent(mockNode.id)}&explain=1`,
    );
  });

  it('switches tabs to Dependents and loads dependent entities', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('node=class:apps/api/services/payment.service.ts:PaymentService'),
    );
    vi.mocked(nodeService.getNode).mockResolvedValue(mockNode);
    vi.mocked(nodeService.getRelationshipSummary).mockResolvedValue(mockSummary);
    vi.mocked(nodeService.getDependencies).mockResolvedValue(mockDeps);
    vi.mocked(nodeService.getDependents).mockResolvedValue(mockDependents);

    render(<DependencyExplorer />);

    expect(await screen.findByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();

    // Switch tab to Dependents
    const dependentsTab = screen.getByRole('tab', { name: /Dependents/i });
    fireEvent.click(dependentsTab);

    expect(await screen.findByText('CheckoutService')).toBeInTheDocument();
    expect(screen.getByText('RefundService')).toBeInTheDocument();
  });
});
