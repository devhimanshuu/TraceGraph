import { Injectable } from '@nestjs/common';
import type { HistoryCommit, HistoryIssue, HistoryPullRequest } from '@tracegraph/shared';
import { GraphRepository } from '../graph/graph.repository';
import { GraphService } from '../graph/graph.service';

/**
 * HistoryService — engineering context for an entity (Phase 5 §18–§19).
 *
 * Traverses the File → Commit → PullRequest → Issue chain for whatever the
 * entity is contained by. The existence gate (404 for unknown nodes) is
 * delegated to GraphService so semantics stay consistent across modules.
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly graphRepository: GraphRepository,
    private readonly graphService: GraphService,
  ) {}

  async getCommits(id: string, limit: number): Promise<HistoryCommit[]> {
    await this.graphService.getNode(id);
    return this.graphRepository.findCommits(id, limit);
  }

  async getPullRequests(id: string, limit: number): Promise<HistoryPullRequest[]> {
    await this.graphService.getNode(id);
    return this.graphRepository.findPullRequests(id, limit);
  }

  async getIssues(id: string, limit: number): Promise<HistoryIssue[]> {
    await this.graphService.getNode(id);
    return this.graphRepository.findIssues(id, limit);
  }
}
