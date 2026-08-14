import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ImpactSummary as ImpactSummaryData } from '@tracegraph/shared';
import { ImpactSummary } from './impact-summary';

const mockSummary: ImpactSummaryData = {
  direct: 2,
  indirect: 3,
  tests: 8,
  commits: 3,
  pullRequests: 2,
  issues: 2,
  maxDepth: 3,
  score: 'HIGH',
  scoreReasons: [
    '2 direct and 3 indirect dependents',
    'Impact reaches the full 3-hop depth',
    '8 potentially affected tests',
  ],
};

describe('ImpactSummary', () => {
  it('renders server-computed metrics with labels', () => {
    render(<ImpactSummary summary={mockSummary} activeTab="all" onSelect={vi.fn()} />);

    expect(screen.getByText('Impact summary')).toBeInTheDocument();
    expect(screen.getByText('depth 3')).toBeInTheDocument();
    // Each metric is a labelled button: value + label.
    expect(screen.getByRole('button', { name: /2\s*Direct/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3\s*Indirect/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /8\s*Tests/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3\s*Commits/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\s*PRs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\s*Issues/i })).toBeInTheDocument();
  });

  it('selects a category on click and toggles back to all', () => {
    const onSelect = vi.fn();
    render(<ImpactSummary summary={mockSummary} activeTab="all" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /2\s*Direct/i }));
    expect(onSelect).toHaveBeenCalledWith('direct');

    fireEvent.click(screen.getByRole('button', { name: /8\s*Tests/i }));
    expect(onSelect).toHaveBeenCalledWith('tests');
  });

  it('marks the active metric as pressed', () => {
    render(<ImpactSummary summary={mockSummary} activeTab="indirect" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /3\s*Indirect/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('renders the deterministic score and its graph-fact reasons', () => {
    render(<ImpactSummary summary={mockSummary} activeTab="all" onSelect={vi.fn()} />);

    expect(screen.getByTestId('impact-score')).toBeInTheDocument();
    expect(screen.getByText('Impact score')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();

    // Reasons are hidden until expanded.
    expect(screen.queryByText('2 direct and 3 indirect dependents')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why this score?' }));

    expect(screen.getByText('2 direct and 3 indirect dependents')).toBeInTheDocument();
    expect(screen.getByText('Impact reaches the full 3-hop depth')).toBeInTheDocument();
    expect(screen.getByText('8 potentially affected tests')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide reasons' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
