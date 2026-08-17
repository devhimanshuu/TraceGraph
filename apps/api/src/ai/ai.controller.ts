import { Body, Controller, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import type { ImpactExplanation } from '@tracegraph/shared';
import { AiService } from './ai.service';
import { ExplainRequestDto } from './dto/explain-request.dto';

/**
 * `POST /api/impact/explain?id=...` — evidence-backed AI explanation of the
 * deterministic impact analysis. The id is a query param: entity ids embed
 * file paths with slashes, and the AWS HTTP API decodes `%2F` in path
 * segments, which would shatter `:id` route matching.
 * The controller is thin: input validation happens in the DTO, and the service
 * re-runs the deterministic analysis to build the evidence — a client-supplied
 * evidence payload is never accepted.
 */
@Controller('impact')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('explain')
  @HttpCode(HttpStatus.OK)
  explain(@Query('id') id: string, @Body() body: ExplainRequestDto): Promise<ImpactExplanation> {
    return this.aiService.explain(id, body);
  }
}
