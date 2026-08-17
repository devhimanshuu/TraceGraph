import { Controller, Get, Query } from '@nestjs/common';
import type { ImpactResponse } from '@tracegraph/shared';
import { ImpactService } from './impact.service';
import { ImpactQueryDto } from './dto/impact-query.dto';

/**
 * `GET /api/impact?id=...&depth=&limit=` — the flagship "Analyze Impact"
 * endpoint. The id is a query param: entity ids embed file paths with slashes,
 * and the AWS HTTP API decodes `%2F` in path segments, which would shatter
 * `:id` route matching.
 * Thin controller: everything (root resolution, traversal, classification,
 * tests/history context, summary) lives in ImpactService.
 */
@Controller('impact')
export class ImpactController {
  constructor(private readonly impactService: ImpactService) {}

  @Get()
  analyze(@Query('id') id: string, @Query() query: ImpactQueryDto): Promise<ImpactResponse> {
    return this.impactService.analyze(id, query);
  }
}
