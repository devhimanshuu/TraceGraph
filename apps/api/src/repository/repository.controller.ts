import { Controller, Get } from '@nestjs/common';
import type { RepositoryOverview } from '@tracegraph/shared';
import { RepositoryService } from './repository.service';

/** `GET /api/repository` — repository overview and statistics. */
@Controller('repository')
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  @Get()
  getOverview(): Promise<RepositoryOverview> {
    return this.repositoryService.getOverview();
  }
}
