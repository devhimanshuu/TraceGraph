import { Controller, Get, Query } from '@nestjs/common';
import type { GraphResponse } from '@tracegraph/shared';
import { GraphService } from './graph.service';
import { GraphQueryDto } from './dto/graph-query.dto';

/** `GET /api/graph` — a bounded neighborhood for graph visualization. */
@Controller('graph')
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @Get()
  getGraph(@Query() query: GraphQueryDto): Promise<GraphResponse> {
    return this.graphService.getGraph(query);
  }
}
