import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  GithubImportJob,
  GithubImportJobStart,
  GithubImportStage,
} from '@tracegraph/shared';
import { randomUUID } from 'node:crypto';
import { GithubImportService } from './github-import.service';

/**
 * Runs repository imports as background jobs so the browser can show live,
 * staged progress (fetching → parsing → building → history → persisting)
 * instead of hanging on a single blocking request. Large repositories take
 * tens of seconds, so the UI polls `GET /api/github/imports/:jobId`.
 *
 * Jobs are held in memory — a process restart loses in-flight imports (the
 * client polls a 404 and offers a retry), which is acceptable for the
 * single-instance assessment deployment.
 */
@Injectable()
export class GithubImportJobService {
  private readonly logger = new Logger(GithubImportJobService.name);
  private readonly jobs = new Map<string, GithubImportJob>();

  constructor(private readonly importer: GithubImportService) {}

  startImport(fullName: string, token?: string): GithubImportJobStart {
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const job: GithubImportJob = {
      jobId,
      fullName,
      status: 'running',
      stage: 'fetching',
      stageLabel: 'Fetching repository files',
      startedAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, job);

    // Fire-and-forget: the job record is the source of truth for the UI.
    void this.importer
      .importRepo(fullName, token, (stage, stageLabel, detail) => {
        this.update(jobId, { stage, stageLabel, detail });
      })
      .then((result) => {
        this.update(jobId, {
          status: 'done',
          stage: 'persisting',
          stageLabel: 'Import complete',
          result,
        });
        this.logger.log(`Import ${jobId} finished for ${fullName}`);
      })
      .catch((err: unknown) => {
        this.update(jobId, {
          status: 'error',
          error: err instanceof Error ? err.message : 'The import failed unexpectedly.',
        });
        this.logger.warn(`Import ${jobId} failed for ${fullName}: ${String(err)}`);
      });

    return { jobId, fullName };
  }

  getJob(jobId: string): GithubImportJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException('Import job not found.');
    }
    return job;
  }

  private update(
    jobId: string,
    patch: Partial<GithubImportJob> & { stage?: GithubImportStage | 'none' },
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }
}
