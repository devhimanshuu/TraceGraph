'use client';

import type { RepositoryOverview } from '@tracegraph/shared';
import { repositoryService } from '@/lib/services/repository.service';
import { useApiResource } from './use-api-resource';

export type RepositoryState = ReturnType<typeof useRepository>;

/** `GET /api/repository` — repository overview + label-scoped statistics. */
export function useRepository() {
  const { data: repository, ...rest } = useApiResource<RepositoryOverview>((token) =>
    repositoryService.getOverview(token),
  );
  return { repository, ...rest };
}
