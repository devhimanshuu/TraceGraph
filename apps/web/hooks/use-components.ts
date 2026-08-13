'use client';

import type { RepositoryComponent } from '@tracegraph/shared';
import { repositoryService } from '@/lib/services/repository.service';
import { useApiResource } from './use-api-resource';

/** `GET /api/repository/components` — core classes ranked by dependents. */
export function useComponents(limit = 8) {
  const { data: components, ...rest } = useApiResource<RepositoryComponent[]>((token) =>
    repositoryService.getComponents(limit, token),
  );
  return { components, ...rest };
}
