import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { ImpactHistoryController } from './impact-history.controller';
import { ImpactHistoryRepository } from './impact-history.repository';
import { ImpactHistoryService } from './impact-history.service';

/**
 * ImpactHistoryModule — CognoDB-backed analysis snapshots (Phase 10).
 *
 * Reuses GraphModule's GraphRepository for default-repository resolution so
 * snapshots are tied to the repository; its own repository owns the snapshot
 * Cypher. The global GitHub session guard (registered in AuthModule) protects every
 * route here.
 */
@Module({
  imports: [GraphModule],
  providers: [ImpactHistoryRepository, ImpactHistoryService],
  controllers: [ImpactHistoryController],
})
export class ImpactHistoryModule {}
