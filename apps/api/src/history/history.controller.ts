import { Controller, Get, Param, Query } from '@nestjs/common';
import type { HistoryCommit, HistoryIssue, HistoryPullRequest } from '@tracegraph/shared';
import { HistoryService } from './history.service';
import { HistoryQueryDto } from '../graph/dto/history-query.dto';

/**
 * `GET /api/nodes/:id/commits|pull-requests|issues` — engineering history.
 * A separate controller (distinct domain) but shares the node route prefix;
 * routes never collide with the graph module's node routes.
 */
@Controller('nodes')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get(':id/commits')
  getCommits(@Param('id') id: string, @Query() query: HistoryQueryDto): Promise<HistoryCommit[]> {
    return this.historyService.getCommits(id, query.limit ?? 50);
  }

  @Get(':id/pull-requests')
  getPullRequests(
    @Param('id') id: string,
    @Query() query: HistoryQueryDto,
  ): Promise<HistoryPullRequest[]> {
    return this.historyService.getPullRequests(id, query.limit ?? 50);
  }

  @Get(':id/issues')
  getIssues(@Param('id') id: string, @Query() query: HistoryQueryDto): Promise<HistoryIssue[]> {
    return this.historyService.getIssues(id, query.limit ?? 50);
  }
}
