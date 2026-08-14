import type { ImpactResponse } from '@tracegraph/shared';

/**
 * Pure selection helpers for the impact graph. A path selection is anchored on
 * one affected entity (`selectedPathId`) but highlights the FULL evidence
 * chain — every node (affected → … → root) and the directed edges between
 * them — not just the anchor. Kept in a separate module so the derivation is
 * unit-testable without pulling React Flow into the test environment.
 */

/** Finds the impacted entity (direct or indirect) by id. */
export function findImpactedEntity(response: ImpactResponse, entityId: string | null) {
  if (!entityId) return undefined;
  return [...response.directImpact, ...response.indirectImpact].find((e) => e.id === entityId);
}

/**
 * Node ids along the selected entity's evidence chain (affected → … → root),
 * or `null` when nothing is selected / the entity is unknown.
 */
export function selectedPathNodeIds(
  response: ImpactResponse,
  entityId: string | null,
): Set<string> | null {
  const entity = findImpactedEntity(response, entityId);
  if (!entity) return null;
  return new Set(entity.path.nodes.map((n) => n.id));
}

/**
 * Directed edge keys (`from::to`) that form the selected entity's evidence
 * chain — the edges to visually emphasize in the graph. Empty when nothing is
 * selected.
 */
export function selectedPathEdgeKeys(
  response: ImpactResponse,
  entityId: string | null,
): Set<string> {
  const keys = new Set<string>();
  const entity = findImpactedEntity(response, entityId);
  if (!entity) return keys;
  for (let i = 0; i < entity.path.nodes.length - 1; i += 1) {
    keys.add(`${entity.path.nodes[i].id}::${entity.path.nodes[i + 1].id}`);
  }
  return keys;
}
