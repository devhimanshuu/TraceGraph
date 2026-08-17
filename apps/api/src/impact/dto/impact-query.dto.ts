import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DEFAULT_IMPACT_DEPTH, DEFAULT_IMPACT_LIMIT, MAX_IMPACT_DEPTH, MAX_IMPACT_LIMIT } from '../impact.constants';

/**
 * `GET /api/impact?id=&depth=&limit=` — bounded impact analysis.
 * The entity id travels as a query param (ids embed file paths with slashes
 * that the AWS HTTP API decodes away from path segments), whitelisted here
 * for `forbidNonWhitelisted` validation and read via `@Query('id')`.
 * Depth is validated/clamped to 1..MAX_IMPACT_DEPTH so the traversal is
 * never unbounded. The limit caps the number of impacted
 * entities in the response.
 */
export class ImpactQueryDto {
  @IsOptional()
  @IsString()
  id?: string;

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
