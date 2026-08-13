import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { RepositoryController } from './repository.controller';
import { RepositoryService } from './repository.service';

/**
 * RepositoryModule — repository overview and statistics (`GET /api/repository`).
 * Reuses GraphRepository from the graph module (single Cypher owner).
 */
@Module({
  imports: [GraphModule],
  providers: [RepositoryService],
  controllers: [RepositoryController],
})
export class RepositoryModule {}
