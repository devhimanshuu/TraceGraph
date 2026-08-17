import { describe, expect, it } from 'vitest';
import type { GraphNode, GraphResponse } from '@tracegraph/shared';
import { flowLayout, forceLayout, ringsLayout } from './graph-layouts';

const ROOT: GraphNode = { id: 'cls:root.ts:Root', type: 'Class', label: 'Root', properties: {} };

function node(id: string, label: string, type: GraphNode['type'] = 'Function'): GraphNode {
  return { id, type, label, properties: {} };
}

/** Root + 3 direct neighbors + 2 second-hop nodes, the demo-like shape. */
function neighborhood(): GraphResponse {
  const a = node('fn:a.ts:A', 'A');
  const b = node('fn:b.ts:B', 'B');
  const c = node('fn:c.ts:C', 'C');
  const d = node('fn:d.ts:D', 'D');
  const e = node('fn:e.ts:E', 'E');
  return {
    root: { id: ROOT.id, type: ROOT.type, label: ROOT.label },
    depth: 2,
    nodes: [ROOT, a, b, c, d, e],
    edges: [
      { id: 'e1', source: ROOT.id, target: a.id, type: 'CALLS', properties: {} },
      { id: 'e2', source: ROOT.id, target: b.id, type: 'IMPORTS', properties: {} },
      { id: 'e3', source: c.id, target: ROOT.id, type: 'CALLS', properties: {} },
      { id: 'e4', source: a.id, target: d.id, type: 'CALLS', properties: {} },
      { id: 'e5', source: b.id, target: e.id, type: 'EXTENDS', properties: {} },
    ],
  };
}

const data = neighborhood();

describe('ringsLayout', () => {
  it('places the root at the exact center', () => {
    const nodes = ringsLayout(data, 2);
    const root = nodes.find((n) => n.id === ROOT.id)!;
    expect(root.position).toEqual({ x: 350, y: 250 });
    expect((root.data as { isRoot: boolean }).isRoot).toBe(true);
  });

  it('orders nodes outward by hop distance: hop-2 nodes sit further from center', () => {
    const nodes = ringsLayout(data, 2);
    const dist = (id: string) => {
      const n = nodes.find((x) => x.id === id)!;
      return Math.hypot(n.position.x - 350, n.position.y - 250);
    };
    // Hop-1 neighbors all inside the hop-2 ring.
    for (const one of ['fn:a.ts:A', 'fn:b.ts:B', 'fn:c.ts:C']) {
      for (const two of ['fn:d.ts:D', 'fn:e.ts:E']) {
        expect(dist(one)).toBeLessThan(dist(two));
      }
    }
  });

  it('is deterministic across calls', () => {
    expect(ringsLayout(data, 2)).toEqual(ringsLayout(data, 2));
  });

  it('returns an empty array for an empty graph', () => {
    expect(ringsLayout({ ...data, nodes: [], edges: [] }, 2)).toEqual([]);
  });
});

describe('flowLayout', () => {
  it('puts the root in the leftmost column and grows x with hop', () => {
    const nodes = flowLayout(data, 2);
    const x = (id: string) => nodes.find((n) => n.id === id)!.position.x;
    expect(x(ROOT.id)).toBeLessThan(x('fn:a.ts:A'));
    expect(x('fn:a.ts:A')).toBeLessThan(x('fn:d.ts:D'));
    expect(x('fn:b.ts:B')).toBeLessThan(x('fn:e.ts:E'));
  });

  it('never overlaps nodes within a column (y spacing is uniform)', () => {
    const nodes = flowLayout(data, 2);
    const ys = nodes.map((n) => n.position.y);
    // Root is vertically centered against its first column; other rows are
    // strictly spaced by the row height constant (105).
    const diffs = new Set(
      nodes
        .filter((n) => n.id !== ROOT.id)
        .map((n) => n.position.y % 105),
    );
    expect(diffs.size).toBe(1);
    expect(ys.length).toBe(nodes.length);
  });

  it('is deterministic across calls', () => {
    expect(flowLayout(data, 2)).toEqual(flowLayout(data, 2));
  });
});

describe('forceLayout', () => {
  it('is deterministic — the seeded simulation reproduces identical positions', () => {
    expect(forceLayout(data, 2)).toEqual(forceLayout(data, 2));
  });

  it('spreads nodes out instead of stacking them at one point', () => {
    const nodes = forceLayout(data, 2);
    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadY = Math.max(...ys) - Math.min(...ys);
    expect(spreadX).toBeGreaterThan(100);
    expect(spreadY).toBeGreaterThan(100);
    // No two nodes share an exact position.
    const seen = new Set(nodes.map((n) => `${n.position.x},${n.position.y}`));
    expect(seen.size).toBe(nodes.length);
  });

  it('stays within a bounded arena around the canvas center', () => {
    const nodes = forceLayout(data, 2);
    for (const n of nodes) {
      expect(Math.abs(n.position.x - 575)).toBeLessThan(600);
      expect(Math.abs(n.position.y - 310)).toBeLessThan(340);
    }
  });
});
