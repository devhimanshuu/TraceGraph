import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  DEFAULT_GRAPH_NODES,
  DEFAULT_TRAVERSAL_DEPTH,
  GRAPH_NODE_TYPES,
  GRAPH_RELATIONSHIP_TYPES,
  MAX_GRAPH_NODES,
  MAX_TRAVERSAL_DEPTH,
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

const ALLOWED_RELATIONSHIP_TYPES = [...GRAPH_RELATIONSHIP_TYPES, ...TRAVERSAL_TYPES];

/** `GET /api/graph?rootId=&depth=&relationshipTypes=&nodeTypes=&limit=` */
export class GraphQueryDto {
  @IsOptional()
  @IsString()
  rootId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TRAVERSAL_DEPTH)
  depth?: number = DEFAULT_TRAVERSAL_DEPTH;

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(ALLOWED_RELATIONSHIP_TYPES, { each: true })
  relationshipTypes?: string[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn([...GRAPH_NODE_TYPES], { each: true })
  nodeTypes?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_GRAPH_NODES)
  limit?: number = DEFAULT_GRAPH_NODES;
}
