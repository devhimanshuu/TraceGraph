import { Controller, Get, Param, Query } from '@nestjs/common';
import type {
  DependencyTarget,
  GraphNode,
  NodeRelationships,
  TestCoverage,
} from '@tracegraph/shared';
import { GraphService } from './graph.service';
import { LimitQueryDto } from './dto/limit-query.dto';

/**
 * `GET /api/nodes/:id/...` — node details and node-scoped graph reads.
 * Thin controller: everything (existence checks, mapping, type-aware
 * semantics) is delegated to GraphService; no Cypher here.
 */
@Controller('nodes')
export class NodeController {
  constructor(private readonly graphService: GraphService) {}

  @Get(':id')
  getNode(@Param('id') id: string): Promise<GraphNode> {
    return this.graphService.getNode(id);
  }

  @Get(':id/relationships')
  getRelationships(
    @Param('id') id: string,
    @Query() query: LimitQueryDto,
  ): Promise<NodeRelationships> {
    return this.graphService.getRelationships(id, query.limit ?? 100);
  }

  @Get(':id/dependencies')
  getDependencies(
    @Param('id') id: string,
    @Query() query: LimitQueryDto,
  ): Promise<DependencyTarget[]> {
    return this.graphService.getDependencies(id, query.limit ?? 100);
  }

  @Get(':id/dependents')
  getDependents(
    @Param('id') id: string,
    @Query() query: LimitQueryDto,
  ): Promise<DependencyTarget[]> {
    return this.graphService.getDependents(id, query.limit ?? 100);
  }

  @Get(':id/callers')
  getCallers(@Param('id') id: string, @Query() query: LimitQueryDto): Promise<DependencyTarget[]> {
    return this.graphService.getCallers(id, query.limit ?? 100);
  }

  @Get(':id/callees')
  getCallees(@Param('id') id: string, @Query() query: LimitQueryDto): Promise<DependencyTarget[]> {
    return this.graphService.getCallees(id, query.limit ?? 100);
  }

  @Get(':id/tests')
  getTests(@Param('id') id: string, @Query() query: LimitQueryDto): Promise<TestCoverage[]> {
    return this.graphService.getTests(id, query.limit ?? 100);
  }
}
