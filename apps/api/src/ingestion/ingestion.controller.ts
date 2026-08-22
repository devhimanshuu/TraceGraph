import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type {
  CreateRepositoryRequest,
  CreateRepositoryResponse,
  RepositoryDetailResponse,
  StartIndexRequest,
  StartIndexResponse,
  IndexProgressResponse,
  IndexDiagnosticsResponse,
  RepositoryRecord,
  IndexRun,
} from '@tracegraph/shared';
import { IndexingWorker } from './indexing-worker';

/**
 * `/api/repositories` — repository CRUD + indexing lifecycle.
 */
@Controller('repositories')
export class IngestionController {
  constructor(private readonly worker: IndexingWorker) {}

  /** Create a repository and queue its first index run. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRepository(
    @Body() dto: CreateRepositoryRequest,
  ): Promise<CreateRepositoryResponse> {
    const result = await this.worker.createRepository(dto.sourceType, dto.sourceUrl);
    // Auto-start indexing
    const run = await this.worker.startIndex(result.repository.id);
    return {
      repository: result.repository,
      indexRun: run,
    };
  }

  /** List all repositories. */
  @Get()
  listRepositories(): Promise<RepositoryRecord[]> {
    return this.worker.listRepositories();
  }

  /** Get repository detail + latest index run. */
  @Get(':id')
  async getRepository(
    @Param('id') id: string,
  ): Promise<RepositoryDetailResponse> {
    const result = await this.worker.getRepository(id);
    if (!result) {
      throw new Error(`Repository not found: ${id}`);
    }
    return result;
  }

  /** Start a new index run for an existing repository. */
  @Post(':id/index')
  @HttpCode(HttpStatus.OK)
  async startIndex(
    @Param('id') id: string,
    @Body() dto?: StartIndexRequest,
  ): Promise<StartIndexResponse> {
    const run = await this.worker.startIndex(id, dto?.branch);
    return { indexRun: run };
  }

  /** List index runs for a repository. */
  @Get(':id/index-runs')
  getIndexRuns(
    @Param('id') id: string,
  ): IndexRun[] {
    return this.worker.getRunsForRepo(id);
  }

  /** Retry a failed index run. */
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  async retryIndex(
    @Param('id') runId: string,
  ): Promise<StartIndexResponse> {
    const run = await this.worker.retryIndex(runId);
    return { indexRun: run };
  }
}

/**
 * `/api/index-runs` — index run progress and diagnostics.
 */
@Controller('index-runs')
export class IndexRunController {
  constructor(private readonly worker: IndexingWorker) {}

  /** Get index run details. */
  @Get(':id')
  async getIndexRun(
    @Param('id') id: string,
  ): Promise<IndexRun> {
    const run = await this.worker.getIndexRun(id);
    if (!run) throw new Error(`Index run not found: ${id}`);
    return run;
  }

  /** Lightweight progress poll endpoint. */
  @Get(':id/progress')
  async getProgress(
    @Param('id') id: string,
  ): Promise<IndexProgressResponse> {
    const progress = await this.worker.getIndexProgress(id);
    if (!progress) throw new Error(`Index run not found: ${id}`);
    return progress;
  }

  /** Get parse diagnostics for an index run. */
  @Get(':id/diagnostics')
  async getDiagnostics(
    @Param('id') id: string,
  ): Promise<IndexDiagnosticsResponse> {
    const result = await this.worker.getIndexDiagnostics(id);
    if (!result) throw new Error(`Index run not found: ${id}`);
    return result;
  }

  /** Cancel a running index job. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelRun(
    @Param('id') id: string,
  ): Promise<IndexRun> {
    const run = await this.worker.cancelIndex(id);
    if (!run) throw new Error(`Index run not found: ${id}`);
    return run;
  }
}
