import { describe, expect, it } from 'vitest';
import type { ImpactResponse } from '@tracegraph/shared';
import {
  findImpactedEntity,
  selectedPathEdgeKeys,
  selectedPathNodeIds,
} from './impact-path-selection';

const root = { id: 'class:payment.service.ts:PaymentService', type: 'Class' as const, label: 'PaymentService' };
const checkout = { id: 'class:checkout.service.ts:CheckoutService', type: 'Class' as const, label: 'CheckoutService' };
const order = { id: 'class:order.service.ts:OrderService', type: 'Class' as const, label: 'OrderService' };

function response(): ImpactResponse {
  return {
    root,
    depth: 2,
    summary: {
      direct: 1,
      indirect: 1,
      tests: 0,
      commits: 0,
      pullRequests: 0,
      issues: 0,
      maxDepth: 2,
      score: 'MEDIUM',
      scoreReasons: [],
    },
    directImpact: [
      {
        id: checkout.id,
        type: 'Class',
        label: 'CheckoutService',
        impactType: 'DIRECT',
        distance: 1,
        relationship: 'CALLS',
        reason: 'x',
        path: { nodes: [checkout, root], relTypes: ['CALLS'] },
      },
    ],
    indirectImpact: [
      {
        id: order.id,
        type: 'Class',
        label: 'OrderService',
        impactType: 'INDIRECT',
        distance: 2,
        relationship: 'CALLS',
        reason: 'x',
        path: { nodes: [order, checkout, root], relTypes: ['CALLS', 'CALLS'] },
      },
    ],
    tests: [],
    history: { commits: [], pullRequests: [], issues: [] },
    paths: [],
  };
}

describe('impact path selection', () => {
  it('resolves the anchor entity across direct and indirect impact', () => {
    expect(findImpactedEntity(response(), checkout.id)?.label).toBe('CheckoutService');
    expect(findImpactedEntity(response(), order.id)?.label).toBe('OrderService');
    expect(findImpactedEntity(response(), 'missing')).toBeUndefined();
    expect(findImpactedEntity(response(), null)).toBeUndefined();
  });

  it('returns the full multi-hop chain for an indirect entity (affected → … → root)', () => {
    const nodes = selectedPathNodeIds(response(), order.id);
    expect(nodes).not.toBeNull();
    expect(Array.from(nodes as Set<string>)).toEqual([order.id, checkout.id, root.id]);
  });

  it('returns the two-node chain for a direct entity', () => {
    const nodes = selectedPathNodeIds(response(), checkout.id);
    expect(Array.from(nodes as Set<string>)).toEqual([checkout.id, root.id]);
  });

  it('returns null for an unknown or missing selection', () => {
    expect(selectedPathNodeIds(response(), 'nope')).toBeNull();
    expect(selectedPathNodeIds(response(), null)).toBeNull();
  });

  it('builds directed edge keys along the selected chain', () => {
    const keys = selectedPathEdgeKeys(response(), order.id);
    expect(keys.has(`${order.id}::${checkout.id}`)).toBe(true);
    expect(keys.has(`${checkout.id}::${root.id}`)).toBe(true);
    // Reverse direction is NOT part of the chain (edges point toward the root).
    expect(keys.has(`${root.id}::${checkout.id}`)).toBe(false);
  });

  it('returns an empty edge set for an unknown selection', () => {
    expect(selectedPathEdgeKeys(response(), null).size).toBe(0);
    expect(selectedPathEdgeKeys(response(), 'nope').size).toBe(0);
  });
});
