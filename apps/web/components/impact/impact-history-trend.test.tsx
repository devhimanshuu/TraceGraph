import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ImpactSnapshot } from '@/lib/impact-history';
import { ImpactHistoryTrend, scoreToLevel } from './impact-history-trend';

function snapshot(partial: Partial<ImpactSnapshot>): ImpactSnapshot {
  return {
    id: 'impact-snapshot:repo:commerce-platform:1',
    nodeId: 'class:apps/api/services/payment.service.ts:PaymentService',
    label: 'PaymentService',
    type: 'Class',
    depth: 2,
    score: 'MEDIUM',
    direct: 1,
    indirect: 1,
    tests: 4,
    timestamp: 1000,
    repoId: 'repo:commerce-platform',
    repoName: 'commerce-platform',
    analyzedBy: null,
    ...partial,
  };
}

describe('scoreToLevel', () => {
  it('maps scores to ascending levels', () => {
    expect(scoreToLevel('LOW')).toBe(0);
    expect(scoreToLevel('MEDIUM')).toBe(1);
    expect(scoreToLevel('HIGH')).toBe(2);
  });
});

describe('ImpactHistoryTrend', () => {
  it('renders a chart describing the score progression oldest → newest', () => {
    const runs = [
      snapshot({ score: 'LOW', timestamp: 100 }),
      snapshot({ score: 'MEDIUM', timestamp: 200 }),
      snapshot({ score: 'HIGH', timestamp: 300 }),
    ];
    render(<ImpactHistoryTrend snapshots={runs} />);

    const svg = screen.getByRole('img', { name: 'Score history: LOW → MEDIUM → HIGH' });
    expect(svg).toBeInTheDocument();
    expect(screen.getByText('Score history')).toBeInTheDocument();
    expect(screen.getByText('3 runs · LOW → HIGH')).toBeInTheDocument();
  });

  it('orders runs by timestamp regardless of input order', () => {
    const runs = [
      snapshot({ score: 'HIGH', timestamp: 300 }),
      snapshot({ score: 'LOW', timestamp: 100 }),
    ];
    render(<ImpactHistoryTrend snapshots={runs} />);

    expect(
      screen.getByRole('img', { name: 'Score history: LOW → HIGH' }),
    ).toBeInTheDocument();
  });

  it('handles a single run without dividing by zero', () => {
    render(<ImpactHistoryTrend snapshots={[snapshot({ score: 'HIGH', timestamp: 100 })]} />);

    expect(
      screen.getByRole('img', { name: 'Score history: HIGH' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 run · HIGH → HIGH')).toBeInTheDocument();
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<ImpactHistoryTrend snapshots={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
