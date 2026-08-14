import type { GraphResponse, SearchResultItem } from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

export interface GraphService {
  search(q: string, limit?: number, token?: string | null): Promise<SearchResultItem[]>;
  getGraph(
    options?: { rootId?: string; depth?: number; limit?: number; relationshipTypes?: string[]; nodeTypes?: string[] },
    token?: string | null,
  ): Promise<GraphResponse>;
}

export const graphService: GraphService = {
  search: (q, limit = 20, token) => apiClient.searchNodes(q, limit, token),
  getGraph: (options, token) => apiClient.getGraph(options, token),
};
