import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TestCoverage } from '@tracegraph/shared';
import { TestCoverageView } from './test-coverage-view';

const mockTests: TestCoverage[] = [
  {
    id: 'test:apps/api/services/payment.service.spec.ts:processPayment_succeeds',
    name: 'processPayment succeeds',
    framework: 'jest',
    filePath: 'apps/api/services/payment.service.spec.ts',
    target: {
      id: 'fn:apps/api/services/payment.service.ts:processPayment',
      type: 'Function',
      label: 'processPayment',
    },
  },
  {
    id: 'test:apps/api/services/payment.service.spec.ts:processPayment_retries',
    name: 'processPayment retries transient failures',
    framework: 'jest',
    filePath: 'apps/api/services/payment.service.spec.ts',
    target: {
      id: 'fn:apps/api/services/payment.service.ts:processPayment',
      type: 'Function',
      label: 'processPayment',
    },
  },
];

describe('TestCoverageView', () => {
  it('groups tests by file path and displays test cases with target function', () => {
    render(
      <TestCoverageView
        tests={mockTests}
        loading={false}
        error={null}
        currentLabel="PaymentService"
      />,
    );

    expect(screen.getByText('apps/api/services/payment.service.spec.ts')).toBeInTheDocument();
    expect(screen.getByText('processPayment succeeds')).toBeInTheDocument();
    expect(screen.getByText('processPayment retries transient failures')).toBeInTheDocument();
    expect(screen.getAllByText('processPayment').length).toBe(2);
    expect(screen.getAllByText('jest').length).toBe(2);
  });

  it('filters tests by keyword', () => {
    render(
      <TestCoverageView
        tests={mockTests}
        loading={false}
        error={null}
        currentLabel="PaymentService"
      />,
    );

    const input = screen.getByLabelText(/Filter tests/i);
    fireEvent.change(input, { target: { value: 'retries' } });

    expect(screen.getByText('processPayment retries transient failures')).toBeInTheDocument();
    expect(screen.queryByText('processPayment succeeds')).not.toBeInTheDocument();
  });

  it('renders skeleton on loading', () => {
    render(
      <TestCoverageView
        tests={null}
        loading={true}
        error={null}
        currentLabel="PaymentService"
      />,
    );
    expect(screen.getByTestId('tests-skeleton')).toBeInTheDocument();
  });

  it('renders empty state when no tests', () => {
    render(
      <TestCoverageView
        tests={[]}
        loading={false}
        error={null}
        currentLabel="PaymentService"
      />,
    );
    expect(screen.getByText('No test coverage found')).toBeInTheDocument();
  });
});
