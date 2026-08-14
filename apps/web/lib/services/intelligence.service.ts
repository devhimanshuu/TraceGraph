import type {
  BlastRadiusResponse,
  KnowledgeResponse,
  OrphanListResponse,
  SmellResponse,
  TestGapResponse,
  TestsForChangeResponse,
} from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

/**
 * Intelligence domain service — the Codebase Intelligence page's single access
 * point to `GET/POST /api/intelligence*`. Components never call `fetch`
 * directly.
 */
export interface IntelligenceService {
  getOrphans(limit?: number, token?: string | null): Promise<OrphanListResponse>;
  getSmells(token?: string | null): Promise<SmellResponse>;
  getTestGaps(limit?: number, token?: string | null): Promise<TestGapResponse>;
  blastRadius(
    files: string[],
    options?: { depth?: number },
    token?: string | null,
  ): Promise<BlastRadiusResponse>;
  testsForChange(
    entityIds: string[],
    options?: { depth?: number },
    token?: string | null,
  ): Promise<TestsForChangeResponse>;
  getKnowledge(
    options?: { entityId?: string; limit?: number },
    token?: string | null,
  ): Promise<KnowledgeResponse>;
}

export const intelligenceService: IntelligenceService = {
  getOrphans: (limit, token) => apiClient.getOrphans(limit, token),
  getSmells: (token) => apiClient.getSmells(token),
  getTestGaps: (limit, token) => apiClient.getTestGaps(limit, token),
  blastRadius: (files, options, token) => apiClient.blastRadius(files, options, token),
  testsForChange: (entityIds, options, token) => apiClient.testsForChange(entityIds, options, token),
  getKnowledge: (options, token) => apiClient.getKnowledge(options, token),
};
