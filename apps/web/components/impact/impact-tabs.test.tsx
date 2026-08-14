import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ImpactSummary } from '@tracegraph/shared';
import { ImpactTabs } from './impact-tabs';

const mockSummary: ImpactSummary = {
  direct: 2,
  indirect: 3,
  tests: 8,
  commits: 3,
  pullRequests: 2,
  issues: 2,
  maxDepth: 3,
  score: 'HIGH',
  scoreReasons: [],
};

describe('ImpactTabs', () => {
  it('renders the five category tabs with server-computed counts', () => {
    render(<ImpactTabs activeTab="all" onTabChange={vi.fn()} summary={mockSummary} />);

    expect(screen.getByRole('tab', { name: /All\s*5/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Direct\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Indirect\s*3/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Tests\s*8/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /History\s*7/ })).toBeInTheDocument();
  });

  it('marks the active tab as selected', () => {
    render(<ImpactTabs activeTab="direct" onTabChange={vi.fn()} summary={mockSummary} />);

    expect(screen.getByRole('tab', { name: /Direct\s*2/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<ImpactTabs activeTab="all" onTabChange={onTabChange} summary={mockSummary} />);

    fireEvent.click(screen.getByRole('tab', { name: /Indirect\s*3/ }));
    expect(onTabChange).toHaveBeenCalledWith('indirect');
  });
});
