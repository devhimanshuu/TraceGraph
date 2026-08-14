import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ImpactHistoryListResponse, ImpactSnapshot } from '@tracegraph/shared';
import { impactHistoryService } from '@/lib/services/impact-history.service';
import { useImpactHistory } from './use-impact-history';

vi.mock('@/lib/services/impact-history.service', () => ({
  impactHistoryService: {
    list: vi.fn(),
    record: vi.fn(),
    clear: vi.fn(),
  },
}));

const repoRef = { id: 'repo:commerce-platform', type: 'Repository' as const, label: 'commerce-platform' };

function snapshot(partial: Partial<ImpactSnapshot> = {}): ImpactSnapshot {
  return {
    id: 'snap-1',
    nodeId: 'class:apps/api/services/payment.service.ts:PaymentService',
    label: 'PaymentService',
    type: 'Class',
    depth: 2,
    score: 'HIGH',
    direct: 2,
    indirect: 2,
    tests: 9,
    timestamp: 1000,
    repoId: repoRef.id,
    repoName: repoRef.label,
    analyzedBy: null,
    ...partial,
  };
}

function ledger(snapshots: ImpactSnapshot[]): ImpactHistoryListResponse {
  return { repo: repoRef, snapshots };
}

describe('useImpactHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(impactHistoryService.list).mockResolvedValue(ledger([]));
    vi.mocked(impactHistoryService.record).mockResolvedValue(ledger([]));
    vi.mocked(impactHistoryService.clear).mockResolvedValue({ deleted: 0 });
  });

  it('loads the ledger on mount and exposes the snapshots', async () => {
    const snap = snapshot();
    vi.mocked(impactHistoryService.list).mockResolvedValue(ledger([snap]));

    const { result } = renderHook(() => useImpactHistory());

    await waitFor(() => expect(result.current.history).toEqual([snap]));
    expect(result.current.loading).toBe(false);
    expect(impactHistoryService.list).toHaveBeenCalledWith(50, 'test-token');
  });

  it('records an analysis and syncs the returned ledger', async () => {
    const snap = snapshot();
    vi.mocked(impactHistoryService.record).mockResolvedValue(ledger([snap]));

    const { result } = renderHook(() => useImpactHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.recordSnapshot({
        nodeId: snap.nodeId,
        label: snap.label,
        type: snap.type,
        depth: snap.depth,
        score: snap.score,
        direct: snap.direct,
        indirect: snap.indirect,
        tests: snap.tests,
      });
    });

    expect(result.current.history).toEqual([snap]);
  });

  it('clears the ledger', async () => {
    const snap = snapshot();
    vi.mocked(impactHistoryService.list).mockResolvedValue(ledger([snap]));

    const { result } = renderHook(() => useImpactHistory());
    await waitFor(() => expect(result.current.history).toEqual([snap]));

    await act(async () => {
      await result.current.clear();
    });

    expect(impactHistoryService.clear).toHaveBeenCalledWith('test-token');
    expect(result.current.history).toEqual([]);
  });

  it('surfaces a load error without crashing', async () => {
    vi.mocked(impactHistoryService.list).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useImpactHistory());

    await waitFor(() => expect(result.current.error).toBe('Could not load impact history'));
    expect(result.current.history).toEqual([]);
  });
});
