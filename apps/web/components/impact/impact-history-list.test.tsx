import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ImpactSnapshot } from '@/lib/impact-history';
import { ImpactHistoryList } from './impact-history-list';

const base: ImpactSnapshot = {
  id: 'impact-snapshot:repo:commerce-platform:1',
  nodeId: 'class:apps/api/services/payment.service.ts:PaymentService',
  label: 'PaymentService',
  type: 'Class',
  depth: 2,
  score: 'HIGH',
  direct: 2,
  indirect: 2,
  tests: 9,
  timestamp: 100,
  repoId: 'repo:commerce-platform',
  repoName: 'commerce-platform',
  analyzedBy: null,
};

const payment: ImpactSnapshot = { ...base };

const paymentV2: ImpactSnapshot = {
  ...base,
  id: 'impact-snapshot:repo:commerce-platform:2',
  depth: 3,
  score: 'MEDIUM',
  timestamp: 200,
};

const checkout: ImpactSnapshot = {
  ...base,
  id: 'impact-snapshot:repo:commerce-platform:3',
  nodeId: 'class:apps/api/services/checkout.service.ts:CheckoutService',
  label: 'CheckoutService',
  score: 'MEDIUM',
  direct: 1,
  indirect: 0,
  tests: 4,
  timestamp: 300,
};

describe('ImpactHistoryList', () => {
  it('opens the panel and lists recorded analyses newest-first', () => {
    render(
      <ImpactHistoryList
        history={[checkout, paymentV2, payment]}
        onNavigate={vi.fn()}
        onClear={vi.fn()}
        onCompare={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    const panel = screen.getByTestId('impact-history-panel');

    // Navigate rows — their accessible name contains the "N hops · …" meta.
    const rows = within(panel).getAllByRole('button', { name: / hops ·/ });
    expect(rows).toHaveLength(3);
    expect(within(panel).getByText('CheckoutService')).toBeInTheDocument();
    expect(within(panel).getByText('3 hops · 2 direct · 2 indirect · 9 tests')).toBeInTheDocument();
  });

  it('navigates when a row is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <ImpactHistoryList history={[payment]} onNavigate={onNavigate} onClear={vi.fn()} onCompare={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    const row = within(screen.getByTestId('impact-history-panel')).getByRole('button', {
      name: / hops ·/,
    });
    fireEvent.click(row);

    expect(onNavigate).toHaveBeenCalledWith(payment);
  });

  it('clears the history from the panel', () => {
    const onClear = vi.fn();
    render(
      <ImpactHistoryList history={[payment]} onNavigate={vi.fn()} onClear={onClear} onCompare={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    fireEvent.click(within(screen.getByTestId('impact-history-panel')).getByRole('button', { name: /Clear/i }));

    expect(onClear).toHaveBeenCalled();
  });

  it('expands a per-entity score trend across all of that entity’s runs', () => {
    render(
      <ImpactHistoryList
        history={[checkout, paymentV2, payment]}
        onNavigate={vi.fn()}
        onClear={vi.fn()}
        onCompare={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /History/ }));

    // Expand one of PaymentService's trend rows — aggregates both of its runs.
    const trendToggle = screen.getByRole('button', {
      name: 'Score history for PaymentService (3 hops)',
    });
    expect(trendToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trendToggle);

    expect(trendToggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('img', { name: 'Score history: HIGH → MEDIUM' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 runs · HIGH → MEDIUM')).toBeInTheDocument();

    // The toggle is per-row — the other PaymentService row stays collapsed.
    expect(
      screen.getByRole('button', { name: 'Score history for PaymentService (2 hops)' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows an empty state when no analyses are recorded', () => {
    render(<ImpactHistoryList history={[]} onNavigate={vi.fn()} onClear={vi.fn()} onCompare={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(screen.getByText(/No analyses recorded yet/i)).toBeInTheDocument();
  });

  it('diffs two selected runs via onCompare, preserving pick order', () => {
    const onCompare = vi.fn();
    render(
      <ImpactHistoryList
        history={[checkout, payment]}
        onNavigate={vi.fn()}
        onClear={vi.fn()}
        onCompare={onCompare}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    const panel = screen.getByTestId('impact-history-panel');

    // The bar appears once one run is picked, but Compare stays disabled until
    // exactly two are selected.
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Compare PaymentService (2 hops)' }),
    );
    expect(within(panel).getByRole('button', { name: 'Compare' })).toBeDisabled();

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Compare CheckoutService (2 hops)' }),
    );

    expect(
      within(panel).getByRole('button', { name: 'Compare PaymentService (2 hops)' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel).getByText('2 selected · pick 2 to compare')).toBeInTheDocument();
    const compare = within(panel).getByRole('button', { name: 'Compare' });
    expect(compare).toBeEnabled();
    fireEvent.click(compare);

    // Selection order is preserved — the first picked run is A, the second is B.
    expect(onCompare).toHaveBeenCalledWith(payment, checkout);
  });

  it('resets the selection and clears the compare bar', () => {
    render(
      <ImpactHistoryList history={[payment]} onNavigate={vi.fn()} onClear={vi.fn()} onCompare={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    const panel = screen.getByTestId('impact-history-panel');
    const toggle = within(panel).getByRole('button', { name: 'Compare PaymentService (2 hops)' });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('impact-history-compare')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Clear selection' }));
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('impact-history-compare')).not.toBeInTheDocument();
  });
});
