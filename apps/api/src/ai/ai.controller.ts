import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { ImpactExplanation } from '@tracegraph/shared';
import { AiService } from './ai.service';
import { ExplainRequestDto } from './dto/explain-request.dto';

/**
 * `POST /api/impact/:id/explain` — evidence-backed AI explanation of the
 * deterministic impact analysis. The controller is thin: input
 * validation happens in the DTO, and the service re-runs the deterministic
 * analysis to build the evidence — a client-supplied evidence payload is never
 * accepted.
 */
@Controller('impact')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post(':id/explain')
  @HttpCode(HttpStatus.OK)
  explain(@Param('id') id: string, @Body() body: ExplainRequestDto): Promise<ImpactExplanation> {
    return this.aiService.explain(id, body);
  }
}
