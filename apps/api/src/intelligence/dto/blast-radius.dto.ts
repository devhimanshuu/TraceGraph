import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_BLAST_DEPTH, MAX_BLAST_FILES } from '../intelligence.constants';

/** A changed-file path from a PR/diff. Loosened so absolute paths and `a/`/`b/` diff prefixes can be stripped by the service. */
const MAX_PATH_LENGTH = 1024;

/**
 * `POST /api/intelligence/blast-radius` — batch impact for a PR/diff.
 * `files` are repository-relative paths; the service also accepts full paths
 * (`/owner/repo/blob/main/...`) and strips the diff `a/` / `b/` prefixes.
 * Bounded: at most 100 changed files and 1..4 hops.
 */
export class BlastRadiusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BLAST_FILES)
  @IsString({ each: true })
  @MaxLength(MAX_PATH_LENGTH, { each: true })
  files!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_BLAST_DEPTH)
  depth?: number;
}

/**
 * `POST /api/intelligence/tests-for-change` — the exact tests to run for a
 * change, ranked by how much of the changed surface each covers.
 */
export class TestsForChangeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BLAST_FILES)
  @IsString({ each: true })
  @MaxLength(MAX_PATH_LENGTH, { each: true })
  entityIds!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_BLAST_DEPTH)
  depth?: number;
}
