import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT } from '../graph.constants';

/** `limit` for history endpoints (commits / pull-requests / issues). */
export class HistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit?: number = DEFAULT_HISTORY_LIMIT;
}
