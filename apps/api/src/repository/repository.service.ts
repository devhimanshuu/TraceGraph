import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  GraphNode,
  ImportedRepository,
  LanguageDistribution,
  RepositoryActivity,
  RepositoryComponent,
  RepositoryOverview,
  RepositoryStats,
  SyncStatus,
} from '@tracegraph/shared';
import { GraphRepository } from '../graph/graph.repository';

/**
 * RepositoryService — `GET /api/repository*`.
 *
 * Composes the repository node with label-scoped statistics. All counts are
 * scoped to TraceGraph labels so statistics never leak other domains' data on
 * a shared CognoDB instance. Includes repo-wide recent activity and core
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
  async getActivity(limit = 10, since?: string): Promise<RepositoryActivity> {
    const repo = await this.requireRepository();
    return this.graphRepository.findRepositoryActivity(repo.id, limit, since);
  }

  /** Core components (classes) ranked by distinct calling functions. */
  async getComponents(limit = 8): Promise<RepositoryComponent[]> {
    const repo = await this.requireRepository();
    return this.graphRepository.findRepositoryComponents(repo.id, limit);
  }

  /** Featured quick-pick entities — most-connected files/classes/functions. */
  async getFeatured(limit = 8): Promise<RepositoryComponent[]> {
    const repo = await this.requireRepository();
    return this.graphRepository.findFeaturedEntities(repo.id, limit);
  }

  /** All imported repositories (for the repo switcher), oldest first. */
  async listRepositories(): Promise<ImportedRepository[]> {
    const repos = await this.graphRepository.findAllRepositories();
    return repos.map((repo) => this.toImportedRepository(repo));
  }

  /** Marks one repository active and returns it (404 when it isn't in the graph). */
  async setActiveRepository(repoId: string): Promise<ImportedRepository> {
    const repos = await this.graphRepository.findAllRepositories();
    const target = repos.find((repo) => repo.id === repoId);
    if (!target) {
      throw new NotFoundException(`Repository "${repoId}" is not in the graph.`);
    }
    await this.graphRepository.setActiveRepository(repoId);
    return this.toImportedRepository(target);
  }

  /**
   * `GET /api/repository/sync-status` — graph sync health overview.
   *
   * Combines label-scoped statistics, language distribution from File nodes,
   * and the repository's timestamps (last push, last import) into a single
   * snapshot the SyncStatusPanel renders.
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const repo = await this.requireRepository();
    const repoId = repo.id;

    const [counts, relationshipCount, languages, timestamps] = await Promise.all([
      this.graphRepository.countNodesByLabel(),
      this.graphRepository.countTraceGraphRelationships(),
      this.graphRepository.findLanguageDistribution(repoId),
      this.graphRepository.findRepositoryTimestamps(),
    ]);

    const totalNodes = Object.values(counts).reduce((sum, n) => sum + n, 0);

    const stats = {
      files: counts.File ?? 0,
      functions: counts.Function ?? 0,
      classes: counts.Class ?? 0,
      tests: counts.Test ?? 0,
      directories: counts.Directory ?? 0,
      commits: counts.Commit ?? 0,
      pullRequests: counts.PullRequest ?? 0,
      issues: counts.Issue ?? 0,
      developers: counts.Developer ?? 0,
    };

    return {
      lastSyncAt: timestamps?.createdAt ?? null,
      lastPushAt: timestamps?.lastPushAt ?? null,
      repository: timestamps?.fullName ?? String(repo.properties.fullName ?? ''),
      totalNodes,
      totalRelationships: relationshipCount,
      languages: languages as LanguageDistribution[],
      stats,
    };
  }

  private toImportedRepository(repo: GraphNode): ImportedRepository {
    const props = repo.properties;
    return {
      id: repo.id,
      name: String(props.name ?? repo.label),
      fullName: String(props.fullName ?? repo.label),
      description: String(props.description ?? ''),
      language: String(props.language ?? ''),
      active: props.active === true,
    };
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
