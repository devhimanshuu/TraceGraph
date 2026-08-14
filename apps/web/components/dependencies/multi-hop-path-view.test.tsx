import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TraversalResult } from '@tracegraph/shared';
import { MultiHopPathView } from './multi-hop-path-view';

const mockTraversal: TraversalResult = {
  root: {
    id: 'class:apps/api/services/payment.service.ts:PaymentService',
    type: 'Class',
    label: 'PaymentService',
  },
  depth: 3,
  nodes: [
    {
      id: 'class:apps/api/services/order.service.ts:OrderService',
      type: 'Class',
      label: 'OrderService',
      hops: 2,
    },
    {
      id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
      type: 'Class',
      label: 'CheckoutService',
      hops: 1,
    },
  ],
  edges: [],
  paths: [
    {
      nodes: [
        'class:apps/api/services/order.service.ts:OrderService',
        'class:apps/api/services/checkout.service.ts:CheckoutService',
        'class:apps/api/services/payment.service.ts:PaymentService',
      ],
      relTypes: ['CALLS', 'CALLS'],
    },
  ],
};

describe('MultiHopPathView', () => {
  it('renders multi-hop evidence path with node pills and relationship badges', () => {
    render(
      <MultiHopPathView
        traversal={mockTraversal}
        loading={false}
        error={null}
        currentLabel="PaymentService"
      />,
    );

    expect(screen.getByText('Multi-hop connection chains')).toBeInTheDocument();
    expect(screen.getByText('Path #1 (2 hops)')).toBeInTheDocument();
    expect(screen.getByText('OrderService')).toBeInTheDocument();
    expect(screen.getByText('CheckoutService')).toBeInTheDocument();
    expect(screen.getByText('PaymentService')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
  });

  it('renders skeleton on loading', () => {
    render(
      <MultiHopPathView
        traversal={null}
        loading={true}
        error={null}
        currentLabel="PaymentService"
      />,
    );
    expect(screen.getByTestId('multi-hop-skeleton')).toBeInTheDocument();
  });

  it('renders empty state when no paths are found', () => {
    render(
      <MultiHopPathView
        traversal={{ ...mockTraversal, paths: [] }}
        loading={false}
        error={null}
        currentLabel="PaymentService"
      />,
    );
    expect(screen.getByText('No multi-hop paths found')).toBeInTheDocument();
  });
});
