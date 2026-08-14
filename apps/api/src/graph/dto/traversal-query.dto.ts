import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  DEFAULT_TRAVERSAL_DEPTH,
  DEFAULT_TRAVERSAL_PATHS,
  MAX_TRAVERSAL_DEPTH,
  MAX_TRAVERSAL_PATHS,
  TRAVERSAL_TYPES,
} from '../graph.constants';

/** Converts a comma-separated query value into an array. */
const csv = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : value;

/**
 * `GET /api/traversal/:id?depth=&types=&limit=&direction=` — bounded
 * multi-hop reachability. `direction=out` (default) walks what the root
 * reaches; `direction=in` walks everything that reaches the root (the
 * dependents chain), which the Dependency Explorer's multi-hop preview uses.
 */
export class TraversalQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TRAVERSAL_DEPTH)
  depth?: number = DEFAULT_TRAVERSAL_DEPTH;

  @IsOptional()
  @IsString()
  @IsIn(['out', 'in'])
  direction?: 'out' | 'in' = 'out';

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn([...TRAVERSAL_TYPES], { each: true })
  types?: string[];

  /** Maximum number of evidence paths returned. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TRAVERSAL_PATHS)
  limit?: number = DEFAULT_TRAVERSAL_PATHS;
}
