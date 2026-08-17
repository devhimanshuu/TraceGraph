import { Controller, Get, Query } from '@nestjs/common';
import type {
  DependencyTarget,
  GraphNode,
  NodeRelationships,
  RelationshipSummary,
  TestCoverage,
} from '@tracegraph/shared';
import { GraphService } from './graph.service';
import { LimitQueryDto } from './dto/limit-query.dto';

/**
 * `GET /api/nodes?id=...&...` — node details and node-scoped graph reads.
 *
 * The id travels as a **query parameter** (never a path segment): entity ids
 * embed file paths (`fn:src/modules/tools/errors.ts:ToolError`), and the AWS
 * HTTP API decodes `%2F` inside path segments before the Lambda sees them,
 * which shatters `:id` route matching. Query strings pass through untouched.
 *
 * Thin controller: everything (existence checks, mapping, type-aware
 * semantics) is delegated to GraphService; no Cypher here.
 */
@Controller('nodes')
export class NodeController {
  constructor(private readonly graphService: GraphService) {}

  @Get()
  getNode(@Query('id') id: string): Promise<GraphNode> {
    return this.graphService.getNode(id);
  }

  @Get('relationship-summary')
  getRelationshipSummary(@Query('id') id: string): Promise<RelationshipSummary> {
    return this.graphService.getRelationshipSummary(id);
  }

  @Get('relationships')
  getRelationships(
    @Query('id') id: string,
    @Query() query: LimitQueryDto,
  ): Promise<NodeRelationships> {
    return this.graphService.getRelationships(id, query.limit ?? 100);
  }

  @Get('dependencies')
  getDependencies(
    @Query('id') id: string,
    @Query() query: LimitQueryDto,
  ): Promise<DependencyTarget[]> {
    return this.graphService.getDependencies(id, query.limit ?? 100);
  }

  @Get('dependents')
  getDependents(
    @Query('id') id: string,
    @Query() query: LimitQueryDto,
  ): Promise<DependencyTarget[]> {
    return this.graphService.getDependents(id, query.limit ?? 100);
  }

  @Get('callers')
  getCallers(@Query('id') id: string, @Query() query: LimitQueryDto): Promise<DependencyTarget[]> {
    return this.graphService.getCallers(id, query.limit ?? 100);
  }

  @Get('callees')
  getCallees(@Query('id') id: string, @Query() query: LimitQueryDto): Promise<DependencyTarget[]> {
    return this.graphService.getCallees(id, query.limit ?? 100);
  }

  @Get('tests')
  getTests(@Query('id') id: string, @Query() query: LimitQueryDto): Promise<TestCoverage[]> {
    return this.graphService.getTests(id, query.limit ?? 100);
  }
}
