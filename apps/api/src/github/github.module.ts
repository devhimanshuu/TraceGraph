import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GraphModule } from '../graph/graph.module';
import { GithubApiService } from './github-api.service';
import { GithubImportJobService } from './github-import-job.service';
import { GithubImportService } from './github-import.service';
import { GithubController } from './github.controller';

/**
 * GitHub onboarding — lists the signed-in user's repositories (via the
 * backend-held session token) and imports one into the graph schema.
 */
@Module({
  imports: [DatabaseModule, GraphModule],
  controllers: [GithubController],
  providers: [GithubApiService, GithubImportService, GithubImportJobService],
  exports: [GithubApiService],
})
export class GithubModule {}
