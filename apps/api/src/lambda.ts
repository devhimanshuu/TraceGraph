import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import serverlessExpress from '@codegenie/serverless-express';
import type { Context, Handler } from 'aws-lambda';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { AppConfig } from './config/configuration';

// The handler returned by @codegenie/serverless-express is promise-based
// `(event, context) => Promise` — typed narrowly so our wrapper matches the
// Node 24 Lambda promise-only handler contract (aws-lambda's `Handler` type
// still describes the legacy 3-arg callback shape).
type ServerlessHandler = (event: unknown, context: Context) => Promise<unknown>;

let server: ServerlessHandler;

async function bootstrap(): Promise<ServerlessHandler> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');

  configureApp(app, config);
  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();
  return serverlessExpress({ app: expressApp }) as unknown as ServerlessHandler;
}

// IMPORTANT: promise-based `(event, context)` signature ONLY — no callback
// parameter. Lambda removed callback-based handlers on the Node 24 runtime
// (Runtime.CallbackHandlerDeprecated), and @codegenie/serverless-express
// already returns a pure async (event, context) handler.
export const handler: Handler = async (event: unknown, context: Context) => {
  // TEMP DEBUG — remove after diagnosing encoded-path 404s
  const e = event as { rawPath?: string; requestContext?: { http?: { method?: string } } };
  console.log('[DEBUG-EVENT]', JSON.stringify({ rawPath: e.rawPath, method: e.requestContext?.http?.method, requestId: context.awsRequestId }));
  server = server ?? (await bootstrap());
  return server(event, context);
};
