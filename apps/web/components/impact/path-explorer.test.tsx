import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ImpactResponse } from '@tracegraph/shared';
import { PathExplorer } from './path-explorer';

const root = { id: 'class:apps/api/services/payment.service.ts:PaymentService', type: 'Class' as const, label: 'PaymentService' };
const checkout = { id: 'class:apps/api/services/checkout.service.ts:CheckoutService', type: 'Class' as const, label: 'CheckoutService' };
const order = { id: 'class:apps/api/services/order.service.ts:OrderService', type: 'Class' as const, label: 'OrderService' };

const mockResponse: ImpactResponse = {
  root,
  depth: 2,
  summary: {
    direct: 1,
    indirect: 1,
    tests: 0,
    commits: 0,
    pullRequests: 0,
    issues: 0,
    maxDepth: 2,
    score: 'MEDIUM',
    scoreReasons: [],
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
  tests: [],
  history: { commits: [], pullRequests: [], issues: [] },
  paths: [],
};

describe('PathExplorer', () => {
  it('renders the "why" panel with the full evidence chain and root marker', () => {
    render(<PathExplorer pathId={order.id} response={mockResponse} onClose={vi.fn()} />);

    expect(screen.getByText('Why is this impacted?')).toBeInTheDocument();
    // OrderService appears in the panel title AND the evidence chain.
    expect(screen.getAllByText('OrderService').length).toBeGreaterThan(0);
    expect(screen.getByText('CheckoutService')).toBeInTheDocument();
    expect(screen.getByText('PaymentService')).toBeInTheDocument();
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getAllByText('CALLS').length).toBe(2);
    expect(
      screen.getByText('OrderService depends on CheckoutService, which calls PaymentService.'),
    ).toBeInTheDocument();
  });

  it('returns null for an unknown path id', () => {
    const { container } = render(
      <PathExplorer pathId="class:unknown" response={mockResponse} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('closes via the close button', () => {
    const onClose = vi.fn();
    render(<PathExplorer pathId={checkout.id} response={mockResponse} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close path explanation' }));
    expect(onClose).toHaveBeenCalled();
  });
});
