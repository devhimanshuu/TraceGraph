import { Injectable, NotFoundException } from '@nestjs/common';
import type { RepositoryOverview, RepositoryStats } from '@tracegraph/shared';
import { GraphRepository } from '../graph/graph.repository';

/**
 * RepositoryService — `GET /api/repository` overview (Phase 5 §5).
 *
 * Composes the repository node with label-scoped statistics. All counts are
 * scoped to TraceGraph labels so statistics never leak other domains' data on
 * a shared CognoDB instance.
 */
@Injectable()
export class RepositoryService {
  constructor(private readonly graphRepository: GraphRepository) {}

  async getOverview(): Promise<RepositoryOverview> {
    const repo = await this.graphRepository.findDefaultRepository();
    if (!repo) {
      throw new NotFoundException(
        'No repository found — the graph is empty. Run `npm run db:seed`.',
      );
    }

    const [counts, relationshipCount] = await Promise.all([
      this.graphRepository.countNodesByLabel(),
      this.graphRepository.countTraceGraphRelationships(),
    ]);

    const stats: RepositoryStats = {
      directories: counts.Directory ?? 0,
      files: counts.File ?? 0,
      functions: counts.Function ?? 0,
      classes: counts.Class ?? 0,
      tests: counts.Test ?? 0,
      commits: counts.Commit ?? 0,
      pullRequests: counts.PullRequest ?? 0,
      issues: counts.Issue ?? 0,
      developers: counts.Developer ?? 0,
    };

    return {
      id: repo.id,
      name: String(repo.properties.name ?? ''),
      fullName: String(repo.properties.fullName ?? ''),
      description: String(repo.properties.description ?? ''),
      language: String(repo.properties.language ?? ''),
      defaultBranch: String(repo.properties.defaultBranch ?? ''),
      stats,
      relationshipCount,
    };
  }
}
