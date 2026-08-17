import type { Node } from '@xyflow/react';
import type { GraphNode, GraphResponse } from '@tracegraph/shared';

/**
 * Deterministic layout engines for the Graph Explorer. No external layout
 * library is pulled in — each algorithm is small, dependency-free and, for
 * the force engine, seeded so the same neighborhood always renders the same
 * picture (stable across re-renders, refreshes and tests).
 *
 * Every engine returns React Flow `Node`s with `data: { node, isRoot }` —
 * the shape `CustomGraphNode` renders — so the component can swap layouts by
 * calling a different function over the same `GraphResponse`.
 */

export type GraphLayoutKey = 'rings' | 'flow' | 'force';

export interface GraphLayoutMeta {
  key: GraphLayoutKey;
  label: string;
  /** Header subtitle fragment, e.g. "Radial · 2-hop neighborhood". */
  viewLabel: string;
  title: string;
}

export const GRAPH_LAYOUTS: GraphLayoutMeta[] = [
  {
    key: 'rings',
    label: 'Rings',
    viewLabel: 'Radial',
    title: 'Concentric rings by distance from the focused node',
  },
  {
    key: 'flow',
    label: 'Flow',
    viewLabel: 'Layered',
    title: 'Left-to-right layers by distance from the focused node',
  },
  {
    key: 'force',
    label: 'Force',
    viewLabel: 'Organic',
    title: 'Force-directed physics simulation of the neighborhood',
  },
];

export const DEFAULT_GRAPH_LAYOUT: GraphLayoutKey = 'rings';

export type GraphLayoutFn = (graphData: GraphResponse, depth: number) => Node[];

/**
 * Hop distance from the root over the returned edge set (undirected), shared
 * by the radial + layered engines. The neighborhood is bidirectional, so BFS
 * over both edge directions is what lets deeper traversals expand outward.
 */
function computeHops(graphData: GraphResponse): Map<string, number> {
  const rootId = graphData.root.id;
  const adjacency = new Map<string, string[]>();
  for (const e of graphData.edges) {
    const out = adjacency.get(e.source) ?? [];
    out.push(e.target);
    adjacency.set(e.source, out);
    const inn = adjacency.get(e.target) ?? [];
    inn.push(e.source);
    adjacency.set(e.target, inn);
  }

  const hops = new Map<string, number>([[rootId, 0]]);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentHop = hops.get(current)!;
    for (const next of adjacency.get(current) ?? []) {
      if (!hops.has(next)) {
        hops.set(next, currentHop + 1);
        queue.push(next);
      }
    }
  }
  return hops;
}

function rootNode(graphData: GraphResponse): GraphNode | undefined {
  return graphData.nodes.find((n) => n.id === graphData.root.id);
}

/** 1 — Concentric hop rings around the focused node (default). */
export function ringsLayout(graphData: GraphResponse, depth: number): Node[] {
  if (graphData.nodes.length === 0) return [];

  const rootId = graphData.root.id;
  const hops = computeHops(graphData);

  // Group nodes by hop ring (isolated nodes default to ring 1).
  const rings = new Map<number, GraphNode[]>();
  for (const n of graphData.nodes) {
    if (n.id === rootId) continue;
    const ring = Math.min(hops.get(n.id) ?? 1, depth);
    const list = rings.get(ring) ?? [];
    list.push(n);
    rings.set(ring, list);
  }

  const center = { x: 350, y: 250 };
  const baseRadius = 190;
  const ringGap = 150;
  const nodes: Node[] = [];

  const root = rootNode(graphData);
  if (root) {
    nodes.push({
      id: root.id,
      type: 'custom',
      position: { x: center.x, y: center.y },
      data: { node: root, isRoot: true },
    });
  }

  // Concentric rings: each hop level sits further out; radius grows with node
  // count so dense rings get more circumference.
  for (const [ring, ringNodes] of [...rings.entries()].sort((a, b) => a[0] - b[0])) {
    const count = ringNodes.length;
    const radius = baseRadius + (ring - 1) * ringGap + Math.max(0, (count - 12) * 4);
    ringNodes.forEach((n, idx) => {
      const angle = (idx / Math.max(1, count)) * 2 * Math.PI - Math.PI / 2;
      nodes.push({
        id: n.id,
        type: 'custom',
        position: {
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle),
        },
        data: { node: n, isRoot: false },
      });
    });
  }

  return nodes;
}

/** 2 — Layered left-to-right flow by distance from the focused node. */
export function flowLayout(graphData: GraphResponse, depth: number): Node[] {
  if (graphData.nodes.length === 0) return [];

  const rootId = graphData.root.id;
  const hops = computeHops(graphData);

  // Columns by hop: hop 1 at x = COLUMN_X, hop 2 at 2·COLUMN_X, … Tall
  // columns wrap into sub-columns (CHUNK rows each) so a dense neighborhood
  // reads as a fan-out flow instead of a single towering list.
  const COLUMN_X = 230;
  const SUB_COLUMN_X = 185;
  const ROW_Y = 105;
  const CHUNK = 13;

  const groups = new Map<number, GraphNode[]>();
  for (const n of graphData.nodes) {
    if (n.id === rootId) continue;
    const hop = Math.min(hops.get(n.id) ?? 1, depth);
    const list = groups.get(hop) ?? [];
    list.push(n);
    groups.set(hop, list);
  }

  const nodes: Node[] = [];
  const root = rootNode(graphData);
  if (root) {
    // Vertically center the root against its first direct-neighbor column.
    const first = groups.get(1) ?? [];
    const centerY = 50 + (Math.min(first.length, CHUNK) / 2) * ROW_Y;
    nodes.push({
      id: root.id,
      type: 'custom',
      position: { x: 40, y: centerY },
      data: { node: root, isRoot: true },
    });
  }

  for (const [hop, hopNodes] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    for (let chunkIdx = 0; chunkIdx * CHUNK < hopNodes.length; chunkIdx += 1) {
      const chunk = hopNodes.slice(chunkIdx * CHUNK, (chunkIdx + 1) * CHUNK);
      chunk.forEach((n, idx) => {
        nodes.push({
          id: n.id,
          type: 'custom',
          position: {
            x: 40 + hop * COLUMN_X + chunkIdx * SUB_COLUMN_X,
            y: 50 + idx * ROW_Y,
          },
          data: { node: n, isRoot: false },
        });
      });
    }
  }

  return nodes;
}

/** Deterministic seeded PRNG (mulberry32) — keeps the simulation reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 3 — Force-directed simulation (repulsion + edge springs + gravity). */
export function forceLayout(graphData: GraphResponse, depth: number): Node[] {
  if (graphData.nodes.length === 0) return [];

  const rootId = graphData.root.id;
  const hops = computeHops(graphData);
  const rng = mulberry32(hashString(rootId));

  const ARENA_W = 1150;
  const ARENA_H = 620;
  const CX = ARENA_W / 2;
  const CY = ARENA_H / 2;
  const n = graphData.nodes.length;
  // Ideal edge length for the node count — the Fruchterman–Reingold constant.
  const k = Math.sqrt((ARENA_W * ARENA_H) / Math.max(1, n));

  // Initial placement: a seeded jittered circle, radius scaled by hop so
  // convergence is fast and rings-ish structure survives the simulation.
  const pos = new Map<string, { x: number; y: number }>();
  graphData.nodes.forEach((node, idx) => {
    const hop = Math.min(hops.get(node.id) ?? 1, depth);
    const angle = (idx / Math.max(1, n)) * 2 * Math.PI + rng() * 0.5;
    const radius = 60 + hop * 130 + rng() * 50;
    pos.set(node.id, {
      x: CX + radius * Math.cos(angle),
      y: CY + radius * Math.sin(angle),
    });
  });

  const ITERATIONS = 200;
  const force = new Map<string, { x: number; y: number }>();
  for (const id of pos.keys()) force.set(id, { x: 0, y: 0 });

  for (let iter = 0; iter < ITERATIONS; iter += 1) {
    // Cooling: forces shrink toward zero so the layout settles.
    const temp = 1 - iter / ITERATIONS;

    for (const f of force.values()) {
      f.x = 0;
      f.y = 0;
    }

    // Repulsion between every pair — O(n²) is fine at neighborhood sizes
    // (the API caps the result set, and the sim runs once per memoized layout).
    const ids = [...pos.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = pos.get(ids[i])!;
        const b = pos.get(ids[j])!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.max(Math.hypot(dx, dy), 0.01);
        const f = (k * k) / dist;
        const ux = dx / dist;
        const uy = dy / dist;
        force.get(ids[i])!.x += ux * f;
        force.get(ids[i])!.y += uy * f;
        force.get(ids[j])!.x -= ux * f;
        force.get(ids[j])!.y -= uy * f;
      }
    }

    // Springs pull connected nodes together (natural length ≈ k).
    for (const e of graphData.edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      const f = (dist * dist) / k;
      const ux = dx / dist;
      const uy = dy / dist;
      force.get(e.source)!.x += ux * f;
      force.get(e.source)!.y += uy * f;
      force.get(e.target)!.x -= ux * f;
      force.get(e.target)!.y -= uy * f;
    }

    // Gentle gravity keeps the neighborhood centered in the canvas.
    for (const id of ids) {
      const p = pos.get(id)!;
      force.get(id)!.x += (CX - p.x) * 0.03;
      force.get(id)!.y += (CY - p.y) * 0.03;
    }

    for (const id of ids) {
      const p = pos.get(id)!;
      const f = force.get(id)!;
      p.x += f.x * temp * 0.06;
      p.y += f.y * temp * 0.06;
      // Soft walls: keep every node inside the arena so nothing flies off-canvas.
      const WALL = 40;
      p.x = Math.min(Math.max(p.x, WALL), ARENA_W - WALL);
      p.y = Math.min(Math.max(p.y, WALL), ARENA_H - WALL);
    }
  }

  return graphData.nodes.map((node) => {
    const p = pos.get(node.id)!;
    return {
      id: node.id,
      type: 'custom',
      position: { x: p.x, y: p.y },
      data: { node, isRoot: node.id === rootId },
    };
  });
}

/** Dispatch used by the explorer: layout key → engine. */
export function layoutGraph(
  graphData: GraphResponse,
  depth: number,
  layout: GraphLayoutKey,
): Node[] {
  switch (layout) {
    case 'flow':
      return flowLayout(graphData, depth);
    case 'force':
      return forceLayout(graphData, depth);
    case 'rings':
      return ringsLayout(graphData, depth);
  }
}
