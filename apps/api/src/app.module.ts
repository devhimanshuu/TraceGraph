import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RepositoryModule } from './repository/repository.module';
import { GraphModule } from './graph/graph.module';
import { DependencyModule } from './dependency/dependency.module';
import { ImpactModule } from './impact/impact.module';
import { HistoryModule } from './history/history.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    RepositoryModule,
    GraphModule,
    DependencyModule,
    ImpactModule,
    HistoryModule,
  ],
})
export class AppModule {}
