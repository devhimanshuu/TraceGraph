import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GraphNode, RelationshipSummary } from '@tracegraph/shared';
import { EntitySummary } from './entity-summary';

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

  it('shows skeleton while loading', () => {
    render(<EntitySummary node={null} summary={null} loading={true} />);
    expect(screen.getByTestId('entity-summary-skeleton')).toBeInTheDocument();
  });
});
