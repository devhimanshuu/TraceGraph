import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RepositoryModule } from './repository/repository.module';
import { GraphModule } from './graph/graph.module';
import { ImpactModule } from './impact/impact.module';
import { ImpactHistoryModule } from './impact-history/impact-history.module';
import { AiModule } from './ai/ai.module';
import { HistoryModule } from './history/history.module';
import { AuthModule } from './auth/auth.module';
import { GithubModule } from './github/github.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { SyncModule } from './sync/sync.module';
import { TestIntelligenceModule } from './test-intelligence/test-intelligence.module';
import { GuardrailsModule } from './guardrails/guardrails.module';
import { OwnershipModule } from './ownership/ownership.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    DatabaseModule,
    HealthModule,
    RepositoryModule,
    GraphModule,
    ImpactModule,
    ImpactHistoryModule,
    AiModule,
    HistoryModule,
    GithubModule,
    IntelligenceModule,
    IngestionModule,
    SyncModule,
    TestIntelligenceModule,
    GuardrailsModule,
    OwnershipModule,
    HistoryModule,
  ],
})
export class AppModule {}
