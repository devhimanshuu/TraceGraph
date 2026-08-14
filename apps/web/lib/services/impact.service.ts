import type { ImpactResponse } from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

/**
 * Impact domain service — the Impact Analysis page's single access point to
 * `GET /api/impact/:id`. Components never call `fetch` directly.
 */
export interface ImpactService {
  getImpact(
    id: string,
    options?: { depth?: number; limit?: number },
    token?: string | null,
  ): Promise<ImpactResponse>;
}

export const impactService: ImpactService = {
  getImpact: (id, options, token) => apiClient.getImpact(id, options, token),
};
