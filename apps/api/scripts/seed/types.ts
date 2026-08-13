/**
 * Core types for the deterministic seed dataset.
 *
 * Nodes and relationships are described declaratively in `scripts/seed/dataset/*`
 * and turned into Cypher by `scripts/seed/loader.ts`. Cypher structure (labels,
 * relationship types) comes from these fixed unions — never from data values —
 * while every *value* is passed as a query parameter.
 */

export const NODE_LABELS = [
  'Repository',
  'Directory',
  'File',
  'Function',
  'Class',
  'Test',
  'Commit',
  'PullRequest',
  'Issue',
  'Developer',
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];

export const REL_TYPES = [
  'CONTAINS',
  'IMPORTS',
  'CALLS',
  'EXTENDS',
  'TESTS',
  'MODIFIES',
  'RELATED_TO',
  'AUTHORED_BY',
] as const;
export type RelType = (typeof REL_TYPES)[number];

export interface SeedNode {
  label: NodeLabel;
  /** Always includes the stable `id`. All other properties are explicit. */
  props: Record<string, unknown>;
}

export interface SeedRel {
  type: RelType;
  fromLabel: NodeLabel;
  toLabel: NodeLabel;
  /** Stable node id of the source. */
  from: string;
  /** Stable node id of the target. */
  to: string;
  /** Relationship properties (empty when none — kept explicit). */
  props?: Record<string, unknown>;
}

export interface SeedDataset {
  nodes: SeedNode[];
  rels: SeedRel[];
}
