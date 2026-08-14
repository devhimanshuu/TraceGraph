import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { ImpactController } from './impact.controller';
import { ImpactRepository } from './impact.repository';
import { ImpactService } from './impact.service';

/**
 * ImpactModule — the flagship "Analyze Impact" feature (Phase 9).
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
  exports: [ImpactService],
})
export class ImpactModule {}
