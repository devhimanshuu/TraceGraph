import { Controller, Get, Param, Query } from '@nestjs/common';
import type { ImpactResponse } from '@tracegraph/shared';
import { ImpactService } from './impact.service';
import { ImpactQueryDto } from './dto/impact-query.dto';

/**
 * `GET /api/impact/:id?depth=&limit=` — the flagship "Analyze Impact" endpoint
 * (Phase 9 §9, §38). Thin controller: everything (root resolution, traversal,
 * classification, tests/history context, summary) lives in ImpactService.
 */
@Controller('impact')
export class ImpactController {
  constructor(private readonly impactService: ImpactService) {}

  @Get(':id')
  analyze(@Param('id') id: string, @Query() query: ImpactQueryDto): Promise<ImpactResponse> {
    return this.impactService.analyze(id, query);
  }
}
