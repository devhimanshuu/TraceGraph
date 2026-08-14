import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  GraphNode,
  RepositoryActivity,
  RepositoryComponent,
  RepositoryOverview,
  RepositoryStats,
} from '@tracegraph/shared';
import { GraphRepository } from '../graph/graph.repository';

/**
 * RepositoryService — `GET /api/repository*` (Phase 5 §5, Phase 6 §8–§14).
 *
 * Composes the repository node with label-scoped statistics. All counts are
 * scoped to TraceGraph labels so statistics never leak other domains' data on
 * a shared CognoDB instance. Phase 6 adds repo-wide recent activity and core
 * components — same repository anchor, one look up, three parallel reads.
 */
@Injectable()
export class RepositoryService {
  constructor(private readonly graphRepository: GraphRepository) {}

  async getOverview(): Promise<RepositoryOverview> {
    const repo = await this.requireRepository();

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

  /** Recent commits / pull requests / issues across the repository. */
  async getActivity(limit = 10): Promise<RepositoryActivity> {
    const repo = await this.requireRepository();
    return this.graphRepository.findRepositoryActivity(repo.id, limit);
  }

  /** Core components (classes) ranked by distinct calling functions. */
  async getComponents(limit = 8): Promise<RepositoryComponent[]> {
    const repo = await this.requireRepository();
    return this.graphRepository.findRepositoryComponents(repo.id, limit);
  }

  /** The seeded repository, or a 404 that explains why the graph is empty. */
  private async requireRepository(): Promise<GraphNode> {
    const repo = await this.graphRepository.findDefaultRepository();
    if (!repo) {
      throw new NotFoundException(
        'No repository found — the graph is empty. Import a GitHub repository to get started.',
      );
    }
    return repo;
  }
}
