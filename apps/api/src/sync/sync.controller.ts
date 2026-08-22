import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type {
  StartSyncRequest,
  StartSyncResponse,
  SyncRunListResponse,
  SyncRunDetailResponse,
  SyncProgressResponse,
  RevisionStatusResponse,
  SyncRun,
} from '@tracegraph/shared';
import { SyncWorker } from './sync-worker';

/**
 * `/api/repositories/:id/sync` — incremental synchronization lifecycle.
 * `/api/sync-runs/:id` — sync run details and progress.
 */
@Controller()
export class SyncController {
  constructor(private readonly syncWorker: SyncWorker) {}

  // ── Repository sync endpoints ────────────────────────────────────────────

  /** Start an incremental sync for a repository. */
  @Post('repositories/:id/sync')
  @HttpCode(HttpStatus.OK)
  async startSync(
    @Param('id') id: string,
    @Body() dto?: StartSyncRequest,
  ): Promise<StartSyncResponse> {
    const syncRun = await this.syncWorker.startSync(id, dto?.branch);
    return { syncRun };
  }

  /** List sync runs for a repository. */
  @Get('repositories/:id/sync-runs')
  getSyncRuns(@Param('id') id: string): SyncRunListResponse {
    return {
      repositoryId: id,
      syncRuns: this.syncWorker.getSyncRunsForRepo(id),
    };
  }

  /** Get repository revision status. */
  @Get('repositories/:id/revision')
  async getRevisionStatus(
    @Param('id') id: string,
  ): Promise<RevisionStatusResponse | null> {
    return this.syncWorker.getRevisionStatus(id);
  }

  // ── Sync run endpoints ───────────────────────────────────────────────────

  /** Get sync run details. */
  @Get('sync-runs/:id')
  async getSyncRun(
    @Param('id') id: string,
  ): Promise<SyncRun> {
    const run = this.syncWorker.getSyncRun(id);
    if (!run) throw new Error(`Sync run not found: ${id}`);
    return run;
  }

  /** Get sync run progress (lightweight poll endpoint). */
  @Get('sync-runs/:id/progress')
  async getSyncProgress(
    @Param('id') id: string,
  ): Promise<SyncProgressResponse> {
    const progress = this.syncWorker.getSyncProgress(id);
    if (!progress) throw new Error(`Sync run not found: ${id}`);
    return progress;
  }

  /** Cancel a running sync. */
  @Post('sync-runs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelSync(
    @Param('id') id: string,
  ): Promise<SyncRun> {
    const run = this.syncWorker.cancelSync(id);
    if (!run) throw new Error(`Sync run not found: ${id}`);
    return run;
  }

  /** Retry a failed sync. */
  @Post('sync-runs/:id/retry')
  @HttpCode(HttpStatus.OK)
  async retrySync(
    @Param('id') id: string,
  ): Promise<StartSyncResponse> {
    const syncRun = await this.syncWorker.retrySync(id);
    return { syncRun };
  }
}
