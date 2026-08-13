'use client';

import type { RepositoryActivity } from '@tracegraph/shared';
import { repositoryService } from '@/lib/services/repository.service';
import { useApiResource } from './use-api-resource';

/** `GET /api/repository/activity` — repo-wide recent commits, PRs and issues. */
export function useActivity(limit = 10) {
  const { data: activity, ...rest } = useApiResource<RepositoryActivity>((token) =>
    repositoryService.getActivity(limit, token),
  );
  return { activity, ...rest };
}
