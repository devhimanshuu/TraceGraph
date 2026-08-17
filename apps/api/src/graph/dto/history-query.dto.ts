import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT } from '../graph.constants';

/**
 * `limit`/`since` for history endpoints (commits / pull-requests / issues).
 * The entity id also travels as a query param, so it is whitelisted here for
 * `forbidNonWhitelisted` validation; the controller reads it via `@Query('id')`.
 */
export class HistoryQueryDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit?: number = DEFAULT_HISTORY_LIMIT;

  /** ISO-8601 timestamp — only activity at/after this time is returned. */
  @IsOptional()
  @IsDateString()
  since?: string;
}
