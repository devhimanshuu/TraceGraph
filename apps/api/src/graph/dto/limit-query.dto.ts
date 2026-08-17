import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DEFAULT_RELATIONSHIP_LIMIT, MAX_RELATIONSHIP_LIMIT } from '../graph.constants';

/**
 * Shared `limit` for node relationships / dependencies / tests endpoints.
 * The entity id also travels as a query param (never a path segment — ids
 * embed file paths with slashes that AWS HTTP API decodes away), so it is
 * whitelisted here for `forbidNonWhitelisted` validation. The controller
 * reads it directly via `@Query('id')`.
 */
export class LimitQueryDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RELATIONSHIP_LIMIT)
  limit?: number = DEFAULT_RELATIONSHIP_LIMIT;
}
