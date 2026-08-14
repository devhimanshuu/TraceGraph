import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { GithubImportResult, GithubRepo } from '@tracegraph/shared';
import { GithubApiService } from './github-api.service';
import { GithubImportService } from './github-import.service';
import { ImportRepoDto } from './dto/import-repo.dto';

interface SessionRequest extends Request {
  user?: { login?: string };
  githubToken?: string;
}

/**
 * `/api/github` — the repo picker + import flow (onboarding). Both routes are
 * auth-gated by the global guard; the GitHub access token is resolved from the
 * verified session and never returned to the browser.
 */
@Controller('github')
export class GithubController {
  constructor(
    private readonly api: GithubApiService,
    private readonly importer: GithubImportService,
  ) {}

  /** Repositories the signed-in user can import, most recently updated first. */
  @Get('repos')
  async listRepos(@Req() req: SessionRequest): Promise<GithubRepo[]> {
    return this.api.listRepos(req.githubToken ?? '');
  }

  /** Imports a repository into the graph (metadata → tree → parse → write). */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  async importRepo(
    @Body() dto: ImportRepoDto,
    @Req() req: SessionRequest,
  ): Promise<GithubImportResult> {
    return this.importer.importRepo(dto.fullName, req.githubToken);
  }
}
