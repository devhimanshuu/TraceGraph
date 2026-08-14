import { Controller, Get, Param, Query } from '@nestjs/common';
import type { TraversalResult } from '@tracegraph/shared';
import { GraphService } from './graph.service';
import { TraversalQueryDto } from './dto/traversal-query.dto';

/**
 * `GET /api/traversal/:id` — bounded multi-hop reachability with evidence
 * paths. The lower-level capability that Impact Analysis builds on.
 */
@Controller('traversal')
export class TraversalController {
  constructor(private readonly graphService: GraphService) {}

  @Get(':id')
  traverse(@Param('id') id: string, @Query() query: TraversalQueryDto): Promise<TraversalResult> {
    return this.graphService.traverse(id, query);
  }
}
