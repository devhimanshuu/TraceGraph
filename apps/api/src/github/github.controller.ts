import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { GithubImportJob, GithubImportJobStart, GithubRepo } from '@tracegraph/shared';
import { GithubApiService } from './github-api.service';
import { GithubImportJobService } from './github-import-job.service';
import { ImportRepoDto } from './dto/import-repo.dto';

interface SessionRequest extends Request {
  user?: { login?: string };
  githubToken?: string;
}

/**
 * `/api/github` — the repo picker + import flow (onboarding). All routes are
 * auth-gated by the global guard; the GitHub access token is resolved from the
 * verified session and never returned to the browser.
 */
@Controller('github')
export class GithubController {
  constructor(
    private readonly api: GithubApiService,
    private readonly jobService: GithubImportJobService,
  ) {}

  /** Repositories the signed-in user can import, most recently updated first. */
  @Get('repos')
  async listRepos(@Req() req: SessionRequest): Promise<GithubRepo[]> {
    return this.api.listRepos(req.githubToken ?? '');
  }

  /**
   * Starts a background import and returns its job id immediately. The caller
   * polls `GET /api/github/imports/:jobId` for staged progress (fetching →
   * parsing → building → history → persisting).
   */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  async importRepo(
    @Body() dto: ImportRepoDto,
    @Req() req: SessionRequest,
  ): Promise<GithubImportJobStart> {
    return this.jobService.startImport(dto.fullName, req.githubToken);
  }

  /** Live status of a background import job. */
  @Get('imports/:jobId')
  getImportStatus(@Param('jobId') jobId: string): GithubImportJob {
    return this.jobService.getJob(jobId);
  }
}
