'use client';

import type { RepositoryActivity } from '@tracegraph/shared';
import { repositoryService } from '@/lib/services/repository.service';
import { activitySince, type ActivityRange } from '@/lib/activity';
import { useApiResource } from './use-api-resource';

/**
 * `GET /api/repository/activity` — repo-wide recent commits, PRs and issues.
 * `range` converts to a `since` cutoff on the server; changing it re-fetches
 * via the dashboard's refresh (the loader closure is updated each render).
 */
export function useActivity(limit = 10, range: ActivityRange = '30d') {
  const since = activitySince(range);
  const { data: activity, ...rest } = useApiResource<RepositoryActivity>((token) =>
    repositoryService.getActivity(limit, since, token),
  );
  return { activity, ...rest };
}
