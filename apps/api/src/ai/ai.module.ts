import { Module } from '@nestjs/common';
import { ImpactModule } from '../impact/impact.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { EvidenceBuilder } from './evidence/evidence-builder';
import { ExplanationValidator } from './explanation.validator';
import { AI_PROVIDER } from './ai.tokens';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';

/**
 * AiModule — evidence-backed AI explanation.
 *
 * The rest of TraceGraph depends on the `AI_PROVIDER` token (an `AiProvider`
 * interface), never on a vendor. Swapping providers means providing a new
 * implementation for that token — nothing else changes.
 *
 * The module imports ImpactModule for the exported ImpactService: the explain
 * pipeline reuses the exact same deterministic analysis, never a second impact
 * engine.
 */
@Module({
  imports: [ImpactModule],
  controllers: [AiController],
  providers: [
    { provide: AI_PROVIDER, useClass: OpenAiCompatibleProvider },
    EvidenceBuilder,
    ExplanationValidator,
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
