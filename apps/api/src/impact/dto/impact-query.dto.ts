import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_IMPACT_DEPTH, DEFAULT_IMPACT_LIMIT, MAX_IMPACT_DEPTH, MAX_IMPACT_LIMIT } from '../impact.constants';

/**
 * `GET /api/impact/:id?depth=&limit=` — bounded impact analysis.
 * Depth is validated/clamped to 1..MAX_IMPACT_DEPTH so the traversal is
 * never unbounded. The limit caps the number of impacted
 * entities in the response.
 */
export class ImpactQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMPACT_DEPTH)
  depth?: number = DEFAULT_IMPACT_DEPTH;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMPACT_LIMIT)
  limit?: number = DEFAULT_IMPACT_LIMIT;
}
