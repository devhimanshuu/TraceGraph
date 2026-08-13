import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from '../graph.constants';

/** `GET /api/search?q=&limit=` — deterministic name/substring search. */
export class SearchQueryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SEARCH_LIMIT)
  limit?: number = DEFAULT_SEARCH_LIMIT;
}
