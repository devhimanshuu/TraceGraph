import { Controller, Get, Query } from '@nestjs/common';
import type {
  HistoryCommit, HistoryIssue, HistoryPullRequest,
  Contributor, ChangeFrequency, ChangeContext, HistoryTimelineEntry, ChangeHeatmapEntry,
} from '@tracegraph/shared';
import { HistoryService } from './history.service';
import { HistoryQueryDto } from '../graph/dto/history-query.dto';

/**
 * `GET /api/node-history?id=...&limit=` — engineering history for an entity.
 *
 * Separate controller (distinct domain) with its own prefix: the graph
 * module's NodeController owns `/nodes`, and entity ids embed file paths with
 * slashes, so ids travel as query params (the AWS HTTP API decodes `%2F` in
 * path segments, which would shatter `:id` route matching).
 */
@Controller('node-history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('commits')
  getCommits(@Query('id') id: string, @Query() query: HistoryQueryDto): Promise<HistoryCommit[]> {
    return this.historyService.getCommits(id, query.limit ?? 50);
  }

  @Get('pull-requests')
  getPullRequests(
    @Query('id') id: string,
    @Query() query: HistoryQueryDto,
  ): Promise<HistoryPullRequest[]> {
    return this.historyService.getPullRequests(id, query.limit ?? 50);
  }

  @Get('issues')
  getIssues(@Query('id') id: string, @Query() query: HistoryQueryDto): Promise<HistoryIssue[]> {
    return this.historyService.getIssues(id, query.limit ?? 50);
  }

  // ── Phase 16: Rich Engineering History ──────────────────────────────────

  @Get('history')
  async getNodeHistory(
    @Query('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.historyService.getFileHistory(id, parseInt(limit ?? '20', 10));
  }

  @Get('contributors')
  async getNodeContributors(
    @Query('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.historyService.getContributors(id, parseInt(limit ?? '20', 10));
  }

  @Get('change-frequency')
  async getNodeChangeFrequency(@Query('id') id: string): Promise<ChangeFrequency> {
    return this.historyService.getChangeFrequency(id);
  }

  @Get('why-changed')
  async getWhyChanged(@Query('id') id: string): Promise<ChangeContext> {
    return this.historyService.getChangeContext(id);
  }
}
