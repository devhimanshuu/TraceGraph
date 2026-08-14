import type { ImpactExplanation } from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

/**
 * AI explanation domain service — the Impact page's single access point to
 * `POST /api/impact/:id/explain`. Components never call `fetch` directly.
 */
export interface AiService {
  explain(id: string, depth: number, token?: string | null): Promise<ImpactExplanation>;
}

export const aiService: AiService = {
  explain: (id, depth, token) => apiClient.explainImpact(id, depth, token),
};
