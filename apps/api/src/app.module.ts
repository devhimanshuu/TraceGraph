import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RepositoryModule } from './repository/repository.module';
import { GraphModule } from './graph/graph.module';
import { ImpactModule } from './impact/impact.module';
import { HistoryModule } from './history/history.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    DatabaseModule,
    HealthModule,
    RepositoryModule,
    GraphModule,
    ImpactModule,
    HistoryModule,
  ],
})
export class AppModule {}
