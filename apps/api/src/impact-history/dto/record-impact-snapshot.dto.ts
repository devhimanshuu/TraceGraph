import { IsIn, IsInt, IsNotEmpty, IsString, Min, Max } from 'class-validator';
import type { ImpactScore } from '@tracegraph/shared';

/**
 * Entity types the impact engine can analyze — the roots the explorer can
 * record snapshots for. Rejects anything else up front.
 */
export const IMPACT_HISTORY_ENTITY_TYPES = [
  'Repository',
  'Directory',
  'File',
  'Function',
  'Class',
] as const;

/**
 * `POST /api/impact-history` — records one completed analysis. The server
 * assigns the snapshot id, timestamp, repository tie, and analyst from the
 * session; clients never send those.
 */
export class RecordImpactSnapshotDto {
  @IsString()
  @IsNotEmpty()
  nodeId!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsIn(IMPACT_HISTORY_ENTITY_TYPES)
  type!: (typeof IMPACT_HISTORY_ENTITY_TYPES)[number];

  @IsInt()
  @Min(1)
  @Max(4)
  depth!: number;

  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  score!: ImpactScore;

  @IsInt()
  @Min(0)
  direct!: number;

  @IsInt()
  @Min(0)
  indirect!: number;

  @IsInt()
  @Min(0)
  tests!: number;
}
