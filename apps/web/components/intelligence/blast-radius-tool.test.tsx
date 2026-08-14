import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BlastRadiusResponse, TestToRun } from '@tracegraph/shared';
import { intelligenceService } from '@/lib/services/intelligence.service';
import { BlastRadiusTool } from './blast-radius-tool';

vi.mock('@/lib/services/intelligence.service', () => ({
  intelligenceService: {
    blastRadius: vi.fn(),
    testsForChange: vi.fn(),
  },
}));

const mockBlast: BlastRadiusResponse = {
  repo: { id: 'repo:commerce-platform', type: 'Repository', label: 'commerce-platform' },
  depth: 2,
  changed: [
    { id: 'file:apps/api/services/payment.service.ts', type: 'File', label: 'payment.service.ts' },
  ],
  unresolved: ['README.md'],
  directImpact: [
    {
      id: 'file:apps/api/services/checkout.service.ts',
      type: 'File',
      label: 'checkout.service.ts',
      impactType: 'DIRECT',
      distance: 1,
      relationship: 'IMPORTS',
      reason: 'checkout.service.ts directly imports payment.service.ts.',
      path: { nodes: [], relTypes: [] },
    },
  ],
  indirectImpact: [],
  tests: [],
  summary: {
    changed: 1,
    direct: 1,
    indirect: 0,
    tests: 0,
    score: 'LOW',
    scoreReasons: [
      '1 direct dependent',
      'No impact reaches beyond the changed files',
      'No test coverage found for the affected surface',
    ],
  },
};

const mockTests: TestToRun[] = [
  {
    id: 'test:payment.spec.ts:process',
    name: 'processPayment succeeds',
    framework: 'jest',
    filePath: 'apps/api/services/payment.service.spec.ts',
    covers: 2,
    directlyCovers: 1,
    risk: 3,
  },
];

describe('BlastRadiusTool', () => {
  beforeEach(() => {
    vi.mocked(intelligenceService.blastRadius).mockResolvedValue(mockBlast);
    vi.mocked(intelligenceService.testsForChange).mockResolvedValue({
      changed: mockBlast.changed,
      unresolved: mockBlast.unresolved,
      tests: mockTests,
    });
  });

  it('runs the analysis on the entered files and renders the summary', async () => {
    render(<BlastRadiusTool />);

    fireEvent.change(screen.getByLabelText(/Changed files/i), {
      target: { value: 'apps/api/services/payment.service.ts\nREADME.md' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Analyze blast radius/i }));

    expect(await screen.findByTestId('blast-results')).toBeInTheDocument();
    expect(screen.getByText('LOW risk')).toBeInTheDocument();
    expect(screen.getByText('1 direct dependent')).toBeInTheDocument();
    expect(screen.getByText('checkout.service.ts')).toBeInTheDocument();
    // Unresolved paths are surfaced, not hidden.
    expect(screen.getByText(/1 path not in graph/i)).toBeInTheDocument();
    // Ranked tests appear with their coverage metadata.
    expect(screen.getByText('processPayment succeeds')).toBeInTheDocument();
    expect(screen.getByText(/risk 3 · covers 2/i)).toBeInTheDocument();

    expect(intelligenceService.blastRadius).toHaveBeenCalledWith(
      ['apps/api/services/payment.service.ts', 'README.md'],
      { depth: 2 },
      'test-token',
    );
  });

  it('disables the run button until files are entered', () => {
    render(<BlastRadiusTool />);
    expect(screen.getByRole('button', { name: /Analyze blast radius/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Changed files/i), {
      target: { value: 'apps/api/services/payment.service.ts' },
    });
    expect(screen.getByRole('button', { name: /Analyze blast radius/i })).toBeEnabled();
  });

  it('fills the sample files on demand', () => {
    render(<BlastRadiusTool />);
    fireEvent.click(screen.getByRole('button', { name: /Try sample files/i }));
    const textarea = screen.getByLabelText(/Changed files/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('app/(dashboard)/_actions/workspaces.ts');
  });
});
