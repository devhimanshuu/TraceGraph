import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { ImpactModule } from '../impact/impact.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceRepository } from './intelligence.repository';
import { IntelligenceService } from './intelligence.service';

/**
 * IntelligenceModule — deterministic repository intelligence (orphans,
 * smells, test gaps, PR blast radius, tests-to-run, knowledge map).
 *
 * Reuses the graph module's single DatabaseService access layer and the
 * impact engine's traversal + test collection, so the new surfaces speak the
 * same dependency semantics as the rest of the product without duplicating
 * any DB infrastructure.
 */
@Module({
  imports: [GraphModule, ImpactModule],
  providers: [IntelligenceRepository, IntelligenceService],
  controllers: [IntelligenceController],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
