import type {
  ImpactHistoryListResponse,
  ImpactSnapshot,
} from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

/**
 * Impact history domain service — the single frontend access point for the
 * CognoDB-backed analysis ledger (`/api/impact-history`). Components and hooks
 * never call `fetch` directly.
 */
export type RecordImpactSnapshotInput = Omit<
  ImpactSnapshot,
  'id' | 'timestamp' | 'repoId' | 'repoName' | 'analyzedBy'
>;

export interface ImpactHistoryService {
  list(limit?: number, token?: string | null): Promise<ImpactHistoryListResponse>;
  record(
    snapshot: RecordImpactSnapshotInput,
    token?: string | null,
  ): Promise<ImpactHistoryListResponse>;
  clear(token?: string | null): Promise<{ deleted: number }>;
}

export const impactHistoryService: ImpactHistoryService = {
  list: (limit, token) => apiClient.getImpactHistory(limit, token),
  record: (snapshot, token) => apiClient.recordImpactSnapshot(snapshot, token),
  clear: (token) => apiClient.clearImpactHistory(token),
};
