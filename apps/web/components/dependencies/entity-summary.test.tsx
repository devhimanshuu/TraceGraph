import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GraphNode, KnowledgeResponse, RelationshipSummary } from '@tracegraph/shared';
import { EntitySummary } from './entity-summary';

vi.mock('@/lib/services/intelligence.service', () => ({
  intelligenceService: {
    getKnowledge: vi.fn().mockResolvedValue({
      repo: { id: 'repo:commerce-platform', type: 'Repository', label: 'commerce-platform' },
      entity: { id: 'class:apps/api/services/payment.service.ts:PaymentService', type: 'Class', label: 'PaymentService' },
      owners: [
        {
          developer: { id: 'developer:dev1', type: 'Developer', label: 'dev1' },
          commits: 14,
          lastCommit: '2025-03-05T00:00:00.000Z',
        },
        {
          developer: { id: 'developer:dev2', type: 'Developer', label: 'dev2' },
          commits: 3,
          lastCommit: '2025-02-01T00:00:00.000Z',
        },
      ],
    } satisfies KnowledgeResponse),
  },
}));

const mockNode: GraphNode = {
  id: 'class:apps/api/services/payment.service.ts:PaymentService',
  type: 'Class',
  label: 'PaymentService',
  properties: {
    filePath: 'apps/api/services/payment.service.ts',
    lineStart: 14,
    lineEnd: 144,
  },
};

const mockSummary: RelationshipSummary = {
  relationships: 12,
  dependencies: 2,
  dependents: 4,
  callers: 4,
  callees: 2,
  tests: 8,
  commits: 3,
  pullRequests: 2,
  issues: 1,
};

describe('EntitySummary', () => {
  it('renders node label, type badge, file path, line numbers, and metric counts', () => {
    render(<EntitySummary node={mockNode} summary={mockSummary} loading={false} />);

    expect(screen.getByRole('heading', { name: 'PaymentService' })).toBeInTheDocument();
    expect(screen.getByText('Class')).toBeInTheDocument();
    expect(screen.getByText('apps/api/services/payment.service.ts')).toBeInTheDocument();
    expect(screen.getByText('L14–144')).toBeInTheDocument();

    expect(screen.getByText('12')).toBeInTheDocument(); // Total relationships
    expect(screen.getByText('2')).toBeInTheDocument(); // Dependencies
    expect(screen.getByText('4')).toBeInTheDocument(); // Dependents
    expect(screen.getByText('8')).toBeInTheDocument(); // Tests
    expect(screen.getByText('6')).toBeInTheDocument(); // Recent changes: 3 + 2 + 1
  });

  it('renders actions including Analyze Impact, Open in Graph, and Change Entity', () => {
    render(<EntitySummary node={mockNode} summary={mockSummary} loading={false} />);

    expect(screen.getByRole('link', { name: /Analyze Impact/i })).toHaveAttribute(
      'href',
      '/impact?node=class%3Aapps%2Fapi%2Fservices%2Fpayment.service.ts%3APaymentService',
    );
    expect(screen.getByRole('link', { name: /Open in Graph/i })).toHaveAttribute(
      'href',
      '/graph?node=class%3Aapps%2Fapi%2Fservices%2Fpayment.service.ts%3APaymentService',
    );
    expect(screen.getByRole('button', { name: /Change Entity/i })).toBeInTheDocument();
  });

  it('pre-fills the PR blast-radius tool with the current file via Analyze PR', () => {
    render(<EntitySummary node={mockNode} summary={mockSummary} loading={false} />);

    expect(screen.getByRole('link', { name: /Analyze PR/i })).toHaveAttribute(
      'href',
      '/intelligence?blast=apps%2Fapi%2Fservices%2Fpayment.service.ts',
    );
  });

  it('shows skeleton while loading', () => {
    render(<EntitySummary node={null} summary={null} loading={true} />);
    expect(screen.getByTestId('entity-summary-skeleton')).toBeInTheDocument();
  });

  it('shows the top-3 committers row with commit counts, each linking to the scoped knowledge map', async () => {
    render(<EntitySummary node={mockNode} summary={mockSummary} loading={false} />);

    const row = await screen.findByTestId('top-committer-chip');
    // Both mocked committers render with their commit counts (rank order).
    expect(row).toHaveTextContent('dev1');
    expect(row).toHaveTextContent('14 commits');
    expect(row).toHaveTextContent('dev2');
    expect(row).toHaveTextContent('3 commits');
    // Every pill deep-links to the Intelligence page scoped to this entity.
    const links = within(row).getAllByRole('link');
    expect(links.length).toBe(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        'href',
        '/intelligence?entity=class%3Aapps%2Fapi%2Fservices%2Fpayment.service.ts%3APaymentService',
      );
    }
  });
});
