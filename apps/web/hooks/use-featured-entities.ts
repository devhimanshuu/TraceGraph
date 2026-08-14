'use client';

import type { RepositoryComponent } from '@tracegraph/shared';
import { repositoryService } from '@/lib/services/repository.service';
import { useApiResource } from './use-api-resource';

/**
 * `GET /api/repository/featured` — real, most-connected files/classes/functions
 * for the dependency/impact explorers' quick-pick cards. Replaces the old
 * hardcoded demo-repo entity list, which 404'd for imported repositories.
 */
export function useFeaturedEntities(limit = 8) {
  const { data: entities, ...rest } = useApiResource<RepositoryComponent[]>((token) =>
    repositoryService.getFeatured(limit, token),
  );
  return { entities, ...rest };
}
