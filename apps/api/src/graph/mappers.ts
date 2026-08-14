/**
 * Record → API DTO mappers.
 *
 * The DatabaseService layer already normalizes driver Records to plain
 * objects; these mappers finish the job: they normalize Neo4j `Integer`
 * wrappers, derive human labels, and shape records into the shared DTO
 * contracts the frontend consumes. No driver structures leak past here.
 */
import type {
  GraphNode,
  GraphNodeRef,
  HistoryCommit,
  HistoryIssue,
  HistoryPullRequest,
  NodeRelationship,
  NodeType,
  RelationshipType,
  TestCoverage,
} from '@tracegraph/shared';

/**
 * If a value is a raw driver Node object (only happens if a query returns a
 * node without `properties()`), unwrap its property map. Queries in the
 * catalog project `properties(n)` explicitly, so this is defensive only.
 */
export function asProperties(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && 'properties' in value && 'labels' in value) {
    return (value as { properties: Record<string, unknown> }).properties ?? {};
  }
  return (value as Record<string, unknown>) ?? {};
}

/** Neo4j `Integer` values survive record normalization; convert them safely. */
export function toNumber(value: unknown): number {
  if (value && typeof value === 'object' && 'toNumber' in (value as { toNumber?: unknown })) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

/** Deterministic human label for any node property map. */
export function humanLabel(props: Record<string, unknown>): string {
  if (typeof props.name === 'string' && props.name) return props.name;
  if (typeof props.title === 'string' && props.title) return props.title;
  if (typeof props.path === 'string' && props.path) {
    const parts = props.path.split('/');
    return parts[parts.length - 1] ?? props.path;
  }
  if (typeof props.sha === 'string' && props.sha) return props.sha;
  if (typeof props.username === 'string' && props.username) return props.username;
  if (typeof props.message === 'string' && props.message) return props.message;
  return String(props.id ?? 'unknown');
}

/** Standard node row shape: `n` = property map, `nodeType` = label. */
export interface NodeRow {
  n: Record<string, unknown>;
  nodeType?: string;
}

export function toGraphNode(row: NodeRow): GraphNode {
  const props = asProperties(row.n);
  return {
    id: String(props.id ?? ''),
    type: (row.nodeType ?? 'File') as NodeType,
    label: humanLabel(props),
    properties: props,
  };
}

export function toNodeRef(id: string, type: string, label: string): GraphNodeRef {
  return { id, type: type as NodeType, label };
}

/** Relationship row: shared columns for incoming/outgoing queries. */
export interface RelationshipRow {
  relType?: string;
  relProps?: Record<string, unknown>;
  sourceId?: string;
  sourceType?: string;
  sourceName?: string;
  targetId?: string;
  targetType?: string;
  targetName?: string;
}

export function toNodeRelationship(
  row: RelationshipRow,
  direction: 'incoming' | 'outgoing',
  index: number,
  self: GraphNodeRef,
): NodeRelationship {
  const source =
    direction === 'outgoing'
      ? self
      : toNodeRef(
          String(row.sourceId ?? ''),
          row.sourceType ?? 'File',
          humanLabel({ name: row.sourceName, id: row.sourceId }),
        );
  const target =
    direction === 'outgoing'
      ? toNodeRef(
          String(row.targetId ?? ''),
          row.targetType ?? 'File',
          humanLabel({ name: row.targetName, id: row.targetId }),
        )
      : self;

  return {
    id: `r-${index + 1}`,
    type: (row.relType ?? 'CONTAINS') as RelationshipType,
    source,
    target,
    properties: row.relProps ?? {},
  };
}

export function toHistoryCommit(row: {
  c?: Record<string, unknown>;
  d?: Record<string, unknown> | null;
}): HistoryCommit {
  const commit = asProperties(row.c);
  const author = row.d
    ? { username: String(row.d.username ?? ''), name: String(row.d.name ?? '') }
    : null;
  return {
    sha: String(commit.sha ?? ''),
    message: String(commit.message ?? ''),
    timestamp: String(commit.timestamp ?? ''),
    branch: String(commit.branch ?? ''),
    author,
  };
}

export function toHistoryPullRequest(row: { pr?: Record<string, unknown> }): HistoryPullRequest {
  const pr = asProperties(row.pr);
  const mergedAt = pr.mergedAt;
  return {
    number: toNumber(pr.number),
    title: String(pr.title ?? ''),
    status: String(pr.status ?? ''),
    createdAt: String(pr.createdAt ?? ''),
    ...(mergedAt !== undefined && mergedAt !== null ? { mergedAt: String(mergedAt) } : {}),
  };
}

export function toHistoryIssue(row: { i?: Record<string, unknown> }): HistoryIssue {
  const issue = asProperties(row.i);
  return {
    number: toNumber(issue.number),
    title: String(issue.title ?? ''),
    status: String(issue.status ?? ''),
    createdAt: String(issue.createdAt ?? ''),
  };
}

export function toTestCoverage(row: {
  t?: Record<string, unknown>;
  fn?: Record<string, unknown>;
}): TestCoverage {
  const test = asProperties(row.t);
  const fn = asProperties(row.fn);
  return {
    id: String(test.id ?? ''),
    name: String(test.name ?? ''),
    framework: String(test.framework ?? ''),
    filePath: String(test.filePath ?? ''),
    target: toNodeRef(String(fn.id ?? ''), 'Function', humanLabel(fn)),
  };
}
