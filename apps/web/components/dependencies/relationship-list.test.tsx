import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DependencyTarget } from '@tracegraph/shared';
import { RelationshipList } from './relationship-list';

const mockItems: DependencyTarget[] = [
  {
    id: 'class:packages/database/database.service.ts:DatabaseService',
    type: 'Class',
    label: 'DatabaseService',
    relationshipType: 'CALLS',
  },
  {
    id: 'class:lib/stripe.client.ts:StripeClient',
    type: 'Class',
    label: 'StripeClient',
    relationshipType: 'CALLS',
    via: {
      id: 'fn:lib/stripe.client.ts:charge',
      type: 'Function',
      label: 'charge',
    },
  },
];

describe('RelationshipList', () => {
  it('renders list of relationships with reason and action links', () => {
    render(
      <RelationshipList
        items={mockItems}
        loading={false}
        error={null}
        direction="dependency"
        currentLabel="PaymentService"
      />,
    );

    expect(screen.getByText('DatabaseService')).toBeInTheDocument();
    expect(screen.getByText('StripeClient')).toBeInTheDocument();
    expect(screen.getByText('PaymentService calls DatabaseService')).toBeInTheDocument();
    expect(screen.getByText('PaymentService calls StripeClient')).toBeInTheDocument();
    expect(screen.getByText('charge')).toBeInTheDocument();

    const graphLinks = screen.getAllByRole('link', { name: /Open in Graph/i });
    expect(graphLinks.length).toBe(2);
  });

  it('filters relationships via local search', () => {
    render(
      <RelationshipList
        items={mockItems}
        loading={false}
        error={null}
        direction="dependency"
        currentLabel="PaymentService"
      />,
    );

    const searchInput = screen.getByLabelText(/Filter relationships/i);
    fireEvent.change(searchInput, { target: { value: 'Stripe' } });

    expect(screen.getByText('StripeClient')).toBeInTheDocument();
    expect(screen.queryByText('DatabaseService')).not.toBeInTheDocument();
  });

  it('renders skeleton on loading', () => {
    render(
      <RelationshipList
        items={null}
        loading={true}
        error={null}
        direction="dependency"
        currentLabel="PaymentService"
      />,
    );
    expect(screen.getByTestId('relationship-skeleton')).toBeInTheDocument();
  });

  it('renders error state and handles retry click', () => {
    const onRetry = vi.fn();
    render(
      <RelationshipList
        items={null}
        loading={false}
        error="Network error"
        direction="dependency"
        currentLabel="PaymentService"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Network error')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders empty state when items list is empty', () => {
    render(
      <RelationshipList
        items={[]}
        loading={false}
        error={null}
        direction="dependency"
        currentLabel="PaymentService"
        emptyTitle="No direct dependencies"
        emptyDescription="This entity does not depend on other components."
      />,
    );

    expect(screen.getByText('No direct dependencies')).toBeInTheDocument();
    expect(
      screen.getByText('This entity does not depend on other components.'),
    ).toBeInTheDocument();
  });
});
