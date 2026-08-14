import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { ImpactController } from './impact.controller';
import { ImpactRepository } from './impact.repository';
import { ImpactService } from './impact.service';

/**
 * ImpactModule — the flagship "Analyze Impact" feature.
 *
 * Reuses the graph module's single DatabaseService access layer: the impact
 * repository executes its own bounded traversal Cypher, while test coverage
 * and engineering history come from the shared GraphRepository (no duplicated
 * DB layer, no raw Cypher in controllers).
 */
@Module({
  imports: [GraphModule],
  providers: [ImpactRepository, ImpactService],
  controllers: [ImpactController],
  // ImpactService for consumers (impact-history, ai) and ImpactRepository for
  // consumers that need the raw traversal (intelligence blast radius).
  exports: [ImpactService, ImpactRepository],
})
export class ImpactModule {}
