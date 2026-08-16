import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT } from '../graph.constants';

/** `limit` for history endpoints (commits / pull-requests / issues). */
export class HistoryQueryDto {
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
