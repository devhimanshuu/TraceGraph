import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ImpactedEntity } from '@tracegraph/shared';
import { AffectedComponents } from './affected-components';

const checkout: ImpactedEntity = {
  id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
  type: 'Class',
  label: 'CheckoutService',
  impactType: 'DIRECT',
  distance: 1,
  relationship: 'CALLS',
  reason: 'CheckoutService directly calls PaymentService.',
  path: {
    nodes: [
      { id: 'class:apps/api/services/checkout.service.ts:CheckoutService', type: 'Class', label: 'CheckoutService' },
      { id: 'class:apps/api/services/payment.service.ts:PaymentService', type: 'Class', label: 'PaymentService' },
    ],
    relTypes: ['CALLS'],
  },
};

const order: ImpactedEntity = {
  id: 'class:apps/api/services/order.service.ts:OrderService',
  type: 'Class',
  label: 'OrderService',
  impactType: 'INDIRECT',
  distance: 2,
  relationship: 'CALLS',
  reason: 'OrderService depends on CheckoutService, which calls PaymentService.',
  path: {
    nodes: [
      { id: 'class:apps/api/services/order.service.ts:OrderService', type: 'Class', label: 'OrderService' },
      { id: 'class:apps/api/services/checkout.service.ts:CheckoutService', type: 'Class', label: 'CheckoutService' },
      { id: 'class:apps/api/services/payment.service.ts:PaymentService', type: 'Class', label: 'PaymentService' },
    ],
    relTypes: ['CALLS', 'CALLS'],
  },
};

describe('AffectedComponents', () => {
  it('renders direct and indirect buckets with reasons and distances', () => {
    render(
      <AffectedComponents direct={[checkout]} indirect={[order]} selectedPathId={null} onSelectPath={vi.fn()} />,
    );

    expect(screen.getByText('Direct impact (1)')).toBeInTheDocument();
    expect(screen.getByText('Indirect impact (1)')).toBeInTheDocument();
    // Labels can repeat in the evidence path, so use getAllByText.
    expect(screen.getAllByText('CheckoutService').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OrderService').length).toBeGreaterThan(0);
    expect(screen.getByText('CheckoutService directly calls PaymentService.')).toBeInTheDocument();
    expect(screen.getByText('OrderService depends on CheckoutService, which calls PaymentService.')).toBeInTheDocument();
    expect(screen.getByText('Distance: 1')).toBeInTheDocument();
    expect(screen.getByText('Distance: 2')).toBeInTheDocument();
  });

  it('renders the evidence path for indirect impact (affected → … → root)', () => {
    render(
      <AffectedComponents direct={[]} indirect={[order]} selectedPathId={null} onSelectPath={vi.fn()} />,
    );

    // Path chain nodes: OrderService (card + path), CheckoutService, PaymentService.
    expect(screen.getAllByText('OrderService').length).toBe(2);
    expect(screen.getByText('CheckoutService')).toBeInTheDocument();
    expect(screen.getByText('PaymentService')).toBeInTheDocument();
  });

  it('fires onSelectPath from "Why impacted?"', () => {
    const onSelectPath = vi.fn();
    render(
      <AffectedComponents direct={[checkout]} indirect={[]} selectedPathId={null} onSelectPath={onSelectPath} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Why impacted?' }));
    expect(onSelectPath).toHaveBeenCalledWith(checkout.id);
  });

  it('links out to graph and dependency explorer with the entity id', () => {
    render(
      <AffectedComponents direct={[checkout]} indirect={[]} selectedPathId={null} onSelectPath={vi.fn()} />,
    );

    const graphLink = screen.getByRole('link', { name: /Open in Graph/i });
    const depsLink = screen.getByRole('link', { name: /View Dependencies/i });

    expect(graphLink).toHaveAttribute('href', `/graph?node=${encodeURIComponent(checkout.id)}`);
    expect(depsLink).toHaveAttribute('href', `/dependencies?node=${encodeURIComponent(checkout.id)}`);
  });

  it('shows an empty message when both buckets are empty', () => {
    render(
      <AffectedComponents direct={[]} indirect={[]} selectedPathId={null} onSelectPath={vi.fn()} />,
    );

    expect(screen.getByText('No affected components in this category.')).toBeInTheDocument();
  });
});
