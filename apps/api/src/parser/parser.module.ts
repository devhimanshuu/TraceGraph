/**
 * ParserModule — NestJS module for the multi-language parser platform.
 */
import { Module } from '@nestjs/common';
import { ParserRegistry } from './parser-registry';
import { GraphWriter } from './graph-writer';
import { ParsingPipeline } from './parsing-pipeline';
import { IncrementalSyncManager } from './incremental-sync-manager';
import { ParserController } from './parser.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ParserController],
  providers: [ParserRegistry, GraphWriter, IncrementalSyncManager, ParsingPipeline],
  exports: [ParserRegistry, ParsingPipeline, GraphWriter, IncrementalSyncManager],
})
export class ParserModule {}
