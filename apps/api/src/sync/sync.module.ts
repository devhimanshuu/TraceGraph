import { Module } from '@nestjs/common';
import { SyncWorker } from './sync-worker';
import { SyncController } from './sync.controller';
import { GitDiffEngine } from './git-diff-engine';
import { GraphDeltaBuilder } from './graph-delta-builder';
import { GraphDeltaApplier } from './graph-delta-applier';
import { IngestionModule } from '../ingestion/ingestion.module';
import { ParserModule } from '../parser/parser.module';

/**
 * SyncModule — incremental synchronization, git diff intelligence,
 * graph delta computation, and revision tracking.
 *
 * Depends on:
 * - IngestionModule (IndexingWorker for repository records + workspace management)
 * - ParserModule (ParsingPipeline for reparse + GraphWriter for persistence)
 */
@Module({
  imports: [IngestionModule, ParserModule],
  controllers: [SyncController],
  providers: [SyncWorker, GitDiffEngine, GraphDeltaBuilder, GraphDeltaApplier],
  exports: [SyncWorker],
})
export class SyncModule {}
