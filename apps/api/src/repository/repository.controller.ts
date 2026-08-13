import { Controller, Get, Query } from '@nestjs/common';
import type { RepositoryActivity, RepositoryComponent, RepositoryOverview } from '@tracegraph/shared';
import { HistoryQueryDto } from '../graph/dto/history-query.dto';
import { RepositoryService } from './repository.service';

/**
 * `GET /api/repository*` — repository overview, statistics, recent activity
 * and core components. All data comes from the Phase 4 seed via GraphRepository.
 */
@Controller('repository')
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  @Get()
  getOverview(): Promise<RepositoryOverview> {
    return this.repositoryService.getOverview();
  }

  @Get('activity')
  getActivity(@Query() query: HistoryQueryDto): Promise<RepositoryActivity> {
    return this.repositoryService.getActivity(query.limit ?? 10);
  }

  @Get('components')
  getComponents(@Query() query: HistoryQueryDto): Promise<RepositoryComponent[]> {
    return this.repositoryService.getComponents(query.limit ?? 8);
  }
}
