import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
  configureApp(app, config);

  await app.listen(config.port);

  Logger.log(`TraceGraph API listening on http://localhost:${config.port}/api`, 'Bootstrap');
  Logger.log(`Health:      http://localhost:${config.port}/api/health`, 'Bootstrap');
  Logger.log(`DB health:   http://localhost:${config.port}/api/health/database`, 'Bootstrap');
}

void bootstrap();
