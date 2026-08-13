import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Applies the shared HTTP configuration (global prefix, validation, CORS,
 * exception filtering, shutdown hooks) to a Nest application instance.
 *
 * Shared between `main.ts` (runtime) and the e2e tests so both run with
 * identical behavior.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');

  // Whitelist strips unknown properties from DTOs; forbidNonWhitelisted
  // rejects them outright; transform enables class-transformer conversions.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Single global exception filter: standardized, sanitized error responses.
  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS is driven entirely by configuration. Development allows the local
  // Next.js origin; production must list explicit origins (no wildcards —
  // enforced by the environment validation schema).
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
  });

  // Allows Nest to run cleanup (e.g., closing the Neo4j driver) on shutdown.
  app.enableShutdownHooks();
}
