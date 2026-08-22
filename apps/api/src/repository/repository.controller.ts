import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import type {
  ImportedRepository,
  RepositoryActivity,
  RepositoryComponent,
  RepositoryOverview,
  SetActiveRepositoryResult,
  SyncStatus,
} from '@tracegraph/shared';
import { HistoryQueryDto } from '../graph/dto/history-query.dto';
import { SetActiveRepositoryDto } from './dto/set-active-repository.dto';
import { RepositoryService } from './repository.service';

/**
 * `GET /api/repository*` — repository overview, statistics, recent activity
 * and core components.
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
    return this.repositoryService.getActivity(query.limit ?? 10, query.since);
  }

  @Get('components')
  getComponents(@Query() query: HistoryQueryDto): Promise<RepositoryComponent[]> {
    return this.repositoryService.getComponents(query.limit ?? 8);
  }

  @Get('featured')
  getFeatured(@Query() query: HistoryQueryDto): Promise<RepositoryComponent[]> {
    return this.repositoryService.getFeatured(query.limit ?? 8);
  }

  /** All imported repositories — for the repo switcher. */
  @Get('list')
  listRepositories(): Promise<ImportedRepository[]> {
    return this.repositoryService.listRepositories();
  }

  /** Switches the active repository (affects dashboard, graph root, history). */
  @Post('active')
  @HttpCode(HttpStatus.OK)
  async setActive(@Body() dto: SetActiveRepositoryDto): Promise<SetActiveRepositoryResult> {
    const active = await this.repositoryService.setActiveRepository(dto.repoId);
    return { active };
  }

  /** Sync status: entity counts, language distribution, timestamps. */
  @Get('sync-status')
  getSyncStatus(): Promise<SyncStatus> {
    return this.repositoryService.getSyncStatus();
  }
}
