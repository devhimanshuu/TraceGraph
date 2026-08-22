import { Module } from '@nestjs/common';
import { GuardrailsController } from './guardrails.controller';
import { GuardrailEngine } from './guardrail-engine';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [GuardrailsController],
  providers: [GuardrailEngine],
  exports: [GuardrailEngine],
})
export class GuardrailsModule {}
