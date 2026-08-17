import { Controller, Get, Query } from '@nestjs/common';
import type { TraversalResult } from '@tracegraph/shared';
import { GraphService } from './graph.service';
import { TraversalQueryDto } from './dto/traversal-query.dto';

/**
 * `GET /api/traversal?id=...&depth=&direction=` — bounded multi-hop
 * reachability with evidence paths. The lower-level capability that Impact
 * Analysis builds on. The id is a query param: entity ids embed file paths
 * with slashes, and the AWS HTTP API decodes `%2F` in path segments, which
 * would shatter `:id` route matching.
 */
@Controller('traversal')
export class TraversalController {
  constructor(private readonly graphService: GraphService) {}

  @Get()
  traverse(@Query('id') id: string, @Query() query: TraversalQueryDto): Promise<TraversalResult> {
    return this.graphService.traverse(id, query);
  }
}
