import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GraphModule } from '../graph/graph.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

/**
 * HistoryModule — engineering context (commits, pull requests, issues) for an
 * entity. Imports the graph module for the shared repository/service.
 */
@Module({
  imports: [GraphModule, DatabaseModule],
  providers: [HistoryService],
  controllers: [HistoryController],
})
export class HistoryModule {}
