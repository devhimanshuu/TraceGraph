import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GraphRepository } from './graph.repository';
import { GraphService } from './graph.service';
import { NodeController } from './node.controller';
import { SearchController } from './search.controller';
import { TraversalController } from './traversal.controller';

/**
 * GraphModule — the code-graph read surface (Phase 5).
 *
 * Owns every node-scoped graph operation: node details, relationships,
 * dependencies/dependents/callers/callees, test coverage, multi-hop
 * traversal, the graph neighborhood, and search.
 *
 * Design note (Phase 5 §3): the Phase 2 `dependency` placeholder module is
 * intentionally folded into this module — dependency queries are node-scoped
 * reads that share this module's single GraphRepository; a separate module
 * would only duplicate wiring. `repository` and `history` are separate
 * modules that import this one to reuse the repository/service.
 */
@Module({
  providers: [GraphRepository, GraphService],
  controllers: [GraphController, NodeController, TraversalController, SearchController],
  exports: [GraphRepository, GraphService],
})
export class GraphModule {}
