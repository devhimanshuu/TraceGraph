import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_IMPACT_DEPTH, MAX_IMPACT_DEPTH } from '../../impact/impact.constants';

/**
 * `POST /api/impact/:id/explain` — the backend validates the depth here and
 * re-runs the deterministic analysis itself. A client-supplied evidence
 * payload is never trusted.
 */
export class ExplainRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMPACT_DEPTH)
  depth?: number = DEFAULT_IMPACT_DEPTH;
}
