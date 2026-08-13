import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { envValidationSchema } from './env.validation';

/**
 * Global configuration module. Loads `.env`, validates it against the Joi
 * schema (fail fast), and exposes the typed `AppConfig` under the `app` key.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
  ],
})
export class ConfigModule {}
