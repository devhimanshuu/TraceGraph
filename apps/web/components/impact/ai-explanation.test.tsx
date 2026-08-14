import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ImpactExplanation } from '@tracegraph/shared';
import { ApiRequestError } from '@/lib/api-client';
import { aiService } from '@/lib/services/ai.service';
import { AiExplanationPanel } from './ai-explanation';

vi.mock('@/lib/services/ai.service', () => ({
  aiService: { explain: vi.fn() },
}));

const NODE_ID = 'class:apps/api/services/payment.service.ts:PaymentService';

const explanation: ImpactExplanation = {
  summary: 'CheckoutService is directly affected because it calls PaymentService.',
  keyFindings: ['CheckoutService is directly affected', 'OrderService is indirectly affected'],
  directImpact: ['CheckoutService'],
  indirectImpact: ['OrderService'],
  evidenceReferences: ['E1', 'E2'],
  confidence: 'high',
  evidence: [
    {
      id: 'E1',
      kind: 'path',
      direction: 'direct',
      description: 'CheckoutService → CALLS → PaymentService',
      label: 'CheckoutService',
      nodes: [
        'class:apps/api/services/checkout.service.ts:CheckoutService',
        'class:apps/api/services/payment.service.ts:PaymentService',
      ],
      relTypes: ['CALLS'],
    },
    {
      id: 'E2',
      kind: 'path',
      direction: 'indirect',
      description: 'OrderService → CALLS → CheckoutService → CALLS → PaymentService',
      label: 'OrderService',
      nodes: [
        'class:apps/api/services/order.service.ts:OrderService',
        'class:apps/api/services/checkout.service.ts:CheckoutService',
        'class:apps/api/services/payment.service.ts:PaymentService',
      ],
      relTypes: ['CALLS', 'CALLS'],
    },
    {
      id: 'E3',
      kind: 'pullRequest',
      description: 'PR #421 — Add payment retry handling',
      label: 'PR #421',
    },
  ],
  generatedAt: '2026-08-14T12:00:00.000Z',
  model: 'llama-3.3-70b-versatile',
  grounding: { source: 'cognodb-impact-analysis' },
};

const onSelectPath = vi.fn();

function renderPanel() {
  return render(
    <AiExplanationPanel
      nodeId={NODE_ID}
      depth={2}
      rootLabel="PaymentService"
      onSelectPath={onSelectPath}
    />,
  );
}

describe('AiExplanationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSelectPath.mockReset();
  });

  it('shows the loading state with staged copy while generating', () => {
    vi.mocked(aiService.explain).mockReturnValue(new Promise(() => undefined));
    renderPanel();

    expect(screen.getByTestId('ai-explanation-loading')).toBeInTheDocument();
    expect(screen.getByText('Generating engineering explanation…')).toBeInTheDocument();
    expect(screen.getByText(/Reviewing dependency paths/)).toBeInTheDocument();
    expect(screen.getByText(/Reviewing test coverage/)).toBeInTheDocument();
    expect(screen.getByText(/Reviewing recent engineering history/)).toBeInTheDocument();
  });

  it('renders the summary, key findings, confidence and evidence chips', async () => {
    vi.mocked(aiService.explain).mockResolvedValue(explanation);
    renderPanel();

    expect(await screen.findByTestId('ai-explanation')).toBeInTheDocument();
    expect(screen.getByTestId('ai-summary')).toHaveTextContent(
      'CheckoutService is directly affected because it calls PaymentService.',
    );
    expect(screen.getByText('Key findings')).toBeInTheDocument();
    expect(screen.getByText('CheckoutService is directly affected')).toBeInTheDocument();
    expect(screen.getByText('OrderService is indirectly affected')).toBeInTheDocument();
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
    expect(screen.getByText('llama-3.3-70b-versatile')).toBeInTheDocument();

    // Evidence chips render with the stable ids; cited ones are marked.
    expect(screen.getByRole('button', { name: /Highlight evidence E1:/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Highlight evidence E2:/ })).toBeInTheDocument();
    expect(screen.getByTitle('PR #421 — Add payment retry handling')).toBeInTheDocument();
  });

  it('highlights the path in the graph when a path evidence chip is clicked', async () => {
    vi.mocked(aiService.explain).mockResolvedValue(explanation);
    renderPanel();

    await screen.findByTestId('ai-explanation');
    fireEvent.click(
      screen.getByRole('button', {
        name: /Highlight evidence E2: OrderService → CALLS → CheckoutService → CALLS → PaymentService/,
      }),
    );
    expect(onSelectPath).toHaveBeenCalledWith(
      'class:apps/api/services/order.service.ts:OrderService',
    );
  });

  it('does not make non-path evidence clickable', async () => {
    vi.mocked(aiService.explain).mockResolvedValue(explanation);
    renderPanel();

    await screen.findByTestId('ai-explanation');
    // E3 is a pull-request chip — rendered as plain text, not a button.
    const chip = screen.getByTitle('PR #421 — Add payment retry handling');
    expect(chip).toBeInTheDocument();
    expect(chip.tagName).not.toBe('BUTTON');
  });

  it('shows the error state and retries on provider failure', async () => {
    vi.mocked(aiService.explain)
      .mockRejectedValueOnce(
        new ApiRequestError('The AI provider could not complete the explanation.', 502, 'AI_UNAVAILABLE'),
      )
      .mockResolvedValueOnce(explanation);
    renderPanel();

    expect(await screen.findByTestId('ai-explanation-error')).toBeInTheDocument();
    expect(screen.getByText('AI explanation unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(/The deterministic impact analysis is still available/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retry explanation/i }));

    expect(await screen.findByTestId('ai-explanation')).toBeInTheDocument();
    expect(aiService.explain).toHaveBeenCalledTimes(2);
  });

  it('shows the disabled state (no retry) when the backend reports AI_DISABLED', async () => {
    vi.mocked(aiService.explain).mockRejectedValue(
      new ApiRequestError('AI explanation is disabled in this environment.', 503, 'AI_DISABLED'),
    );
    renderPanel();

    expect(await screen.findByTestId('ai-explanation-disabled')).toBeInTheDocument();
    expect(
      screen.getByText('AI explanation is unavailable in this environment.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Deterministic graph analysis remains available.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument();
  });

  it('regenerates a new explanation on demand', async () => {
    vi.mocked(aiService.explain).mockResolvedValue(explanation);
    renderPanel();

    await screen.findByTestId('ai-explanation');
    fireEvent.click(screen.getByRole('button', { name: /Regenerate explanation/i }));

    // The refetch shows the loading state again, then success.
    expect(await screen.findByTestId('ai-explanation')).toBeInTheDocument();
    expect(aiService.explain).toHaveBeenCalledTimes(2);
    expect(aiService.explain).toHaveBeenCalledWith(NODE_ID, 2, 'test-token');
  });
});
