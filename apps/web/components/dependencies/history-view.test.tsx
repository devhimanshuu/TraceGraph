import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { HistoryCommit, HistoryIssue, HistoryPullRequest } from '@tracegraph/shared';
import { HistoryView } from './history-view';

const mockCommits: HistoryCommit[] = [
  {
    sha: '8f21ac7',
    message: 'Add retry handling to payment flow',
    timestamp: '2025-03-05T08:45:00.000Z',
    branch: 'main',
    author: { username: 'alex', name: 'Alex Morgan' },
  },
];

const mockPRs: HistoryPullRequest[] = [
  {
    number: 421,
    title: 'Add payment retry handling',
    status: 'merged',
    createdAt: '2025-03-05T08:45:00.000Z',
  },
];

const mockIssues: HistoryIssue[] = [
  {
    number: 912,
    title: 'Checkout occasionally times out',
    status: 'closed',
    createdAt: '2025-02-20T10:15:00.000Z',
  },
];

describe('HistoryView', () => {
  it('renders history explanation banner, commits, PRs, and issues', () => {
    render(
      <HistoryView
        commits={mockCommits}
        pullRequests={mockPRs}
        issues={mockIssues}
        loading={false}
        error={null}
        currentLabel="PaymentService"
      />,
    );

    expect(screen.getByText('How history connects to PaymentService')).toBeInTheDocument();
    expect(screen.getByText('8f21ac7')).toBeInTheDocument();
    expect(screen.getByText('Add retry handling to payment flow')).toBeInTheDocument();
    expect(screen.getByText('#421')).toBeInTheDocument();
    expect(screen.getByText('Add payment retry handling')).toBeInTheDocument();
    expect(screen.getByText('#912')).toBeInTheDocument();
    expect(screen.getByText('Checkout occasionally times out')).toBeInTheDocument();
  });

  it('switches sub-tabs between PRs, Commits, and Issues', () => {
    render(
      <HistoryView
        commits={mockCommits}
        pullRequests={mockPRs}
        issues={mockIssues}
        loading={false}
        error={null}
        currentLabel="PaymentService"
      />,
    );

    // Switch to PRs tab
    fireEvent.click(screen.getByRole('button', { name: /PRs/i }));
    expect(screen.getByText('#421')).toBeInTheDocument();
    expect(screen.queryByText('8f21ac7')).not.toBeInTheDocument();

    // Switch to Commits tab
    fireEvent.click(screen.getByRole('button', { name: /Commits/i }));
    expect(screen.getByText('8f21ac7')).toBeInTheDocument();
    expect(screen.queryByText('#421')).not.toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    render(
      <HistoryView
        commits={null}
        pullRequests={null}
        issues={null}
        loading={true}
        error={null}
        currentLabel="PaymentService"
      />,
    );
    expect(screen.getByTestId('history-skeleton')).toBeInTheDocument();
  });
});
