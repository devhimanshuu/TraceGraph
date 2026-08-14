import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MAX_INTELLIGENCE_LIMIT } from '../intelligence.constants';

/** Shared query params for `GET /api/intelligence*` list endpoints. */
export class IntelligenceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INTELLIGENCE_LIMIT)
  limit?: number = 50;

  /** Scope the knowledge map to a single entity (optional). */
  @IsOptional()
  @IsString()
  entityId?: string;
}
