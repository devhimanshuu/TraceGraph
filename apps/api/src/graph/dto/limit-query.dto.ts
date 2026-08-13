import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_RELATIONSHIP_LIMIT, MAX_RELATIONSHIP_LIMIT } from '../graph.constants';

/** Shared `limit` for node relationships / dependencies / tests endpoints. */
export class LimitQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RELATIONSHIP_LIMIT)
  limit?: number = DEFAULT_RELATIONSHIP_LIMIT;
}
