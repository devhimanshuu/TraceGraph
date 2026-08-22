import { Module } from '@nestjs/common';
import { IndexingWorker } from './indexing-worker';
import { IngestionController, IndexRunController } from './ingestion.controller';
import { ParserModule } from '../parser/parser.module';

/**
 * IngestionModule — repository registration, file discovery, indexing lifecycle.
 *
 * Depends on ParserModule (ParsingPipeline + GraphWriter) for the actual
 * parse + persist stages. The IndexingWorker orchestrates the full lifecycle.
 */
@Module({
  imports: [ParserModule],
  controllers: [IngestionController, IndexRunController],
  providers: [IndexingWorker],
  exports: [IndexingWorker],
})
export class IngestionModule {}
