import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DEFAULT_IMPACT_HISTORY_LIMIT,
  MAX_IMPACT_HISTORY_LIMIT,
} from '../impact-history.constants';

/** `GET /api/impact-history?limit=` — page size for the snapshot ledger. */
export class ImpactHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMPACT_HISTORY_LIMIT)
  limit?: number = DEFAULT_IMPACT_HISTORY_LIMIT;
}
