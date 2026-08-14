import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GraphRepository } from './graph.repository';
import { GraphService } from './graph.service';
import { NodeController } from './node.controller';
import { SearchController } from './search.controller';
import { TraversalController } from './traversal.controller';

/**
 * GraphModule — the code-graph read surface.
 *
 * Owns every node-scoped graph operation: node details, relationships,
 * dependencies/dependents/callers/callees, test coverage, multi-hop
 * traversal, the graph neighborhood, and search.
 *
 * Design note: dependency queries are node-scoped reads that share this module's
 * single GraphRepository. `repository` and `history` are separate modules that
 * import this one to reuse the repository/service.
 */
@Module({
  providers: [GraphRepository, GraphService],
  controllers: [GraphController, NodeController, TraversalController, SearchController],
  exports: [GraphRepository, GraphService],
})
export class GraphModule {}
