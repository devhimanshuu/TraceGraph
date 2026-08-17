'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowRight,
  FlaskConical,
  GitCompareArrows,
  GitFork,
  LayoutGrid,
  Layers,
  Maximize,
  Minimize,
  Network,
  Orbit,
  Radar,
  RotateCcw,
  Search,
  Target,
  Waypoints,
  Workflow,
} from 'lucide-react';
import { useGitHubSession } from '@/hooks/use-github-session';
import type { GraphNode, GraphResponse, TraversalResult } from '@tracegraph/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { apiClient } from '@/lib/api-client';
import { EntitySearchDialog } from '@/components/dependencies/entity-search-dialog';
import {
  NodeTypeBadge,
  NodeTypeIcon,
} from '@/components/dependencies/relationship-badge';
import { NodeDetailsPanel } from '@/components/graph/node-details-panel';
import {
  DEFAULT_GRAPH_LAYOUT,
  GRAPH_LAYOUTS,
  layoutGraph,
  type GraphLayoutKey,
} from '@/lib/graph-layouts';

/** Node-type → hex accents (dark-theme 400-level tones). Mirrors getNodeTypeColor. */
const NODE_TYPE_HEX: Record<string, string> = {
  Class: '#34d399',
  Function: '#a78bfa',
  File: '#38bdf8',
  Test: '#fbbf24',
  Commit: '#22d3ee',
  PullRequest: '#c084fc',
  Issue: '#fb7185',
  Directory: '#94a3b8',
  Repository: '#94a3b8',
  Developer: '#94a3b8',
};

/** Relationship-type → hex edge colors. Mirrors RelationshipTypeBadge. */
const REL_TYPE_HEX: Record<string, string> = {
  CALLS: '#a78bfa',
  IMPORTS: '#38bdf8',
  EXTENDS: '#34d399',
  TESTS: '#fbbf24',
  MODIFIES: '#818cf8',
  CONTAINS: '#818cf8',
  AUTHORED_BY: '#818cf8',
  RELATED_TO: '#818cf8',
};

// Custom ReactFlow Node
function CustomGraphNode({ data, selected }: NodeProps) {
  const node = data.node as GraphNode;
  const isRoot = Boolean(data.isRoot);
  const whatIfStatus = data.whatIfStatus as 'removed' | 'affected' | undefined;
  const traceEntry = Boolean(data.traceEntry);
  const typeHex = NODE_TYPE_HEX[node?.type ?? 'Class'] ?? '#94a3b8';

  return (
    <div
      className={`group flex min-w-40 max-w-56 flex-col gap-1 rounded-xl border p-3 shadow-md transition-all ${
        whatIfStatus === 'removed'
          ? 'border-dashed border-rose-500/40 bg-card/60'
          : whatIfStatus === 'affected'
            ? 'border-rose-500/60 bg-card ring-2 ring-rose-500/20'
            : isRoot
              ? 'border-sky-500/50 bg-card ring-2 ring-sky-500/25'
              : selected
                ? 'bg-card ring-2 ring-muted-foreground/30'
                : 'border-border/80 bg-card/90 hover:border-border hover:bg-card'
      }`}
      style={
        whatIfStatus === 'affected'
          ? { boxShadow: '0 0 18px -5px rgba(244,63,94,0.55)' }
          : !isRoot && selected
            ? { borderColor: typeHex }
            : undefined
      }
    >
      <Handle type="target" position={Position.Top} className="size-2 !bg-muted-foreground/70" />
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md"
          style={
            isRoot
              ? { background: 'linear-gradient(135deg, #0ea5e9, #4f46e5)' }
              : { backgroundColor: `${typeHex}1f`, color: typeHex }
          }
        >
          <NodeTypeIcon type={node?.type ?? 'Class'} className="size-3.5" />
        </span>
        <span className="truncate text-xs font-semibold text-foreground" title={node?.label}>
          {node?.label}
        </span>
      </div>
      <div className="flex items-center justify-between gap-1 pt-0.5">
        <NodeTypeBadge type={node?.type ?? 'Class'} />
        {whatIfStatus === 'removed' ? (
          <span className="font-mono text-[9px] font-bold uppercase text-rose-400/80">
            Removed
          </span>
        ) : whatIfStatus === 'affected' ? (
          <span className="font-mono text-[9px] font-bold uppercase text-rose-400">
            Would break
          </span>
        ) : traceEntry ? (
          <span className="font-mono text-[9px] font-bold uppercase text-cyan-400">Entry</span>
        ) : isRoot ? (
          <span className="font-mono text-[9px] font-bold uppercase text-sky-400">Focus</span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="size-2 !bg-muted-foreground/70" />
    </div>
  );
}

const nodeTypes = {
  custom: CustomGraphNode,
};

/**
 * Edge with an animated data-flow overlay — the same traveling-dash effect as
 * the landing preview. The base path carries color/label/arrow; the overlay
 * dash (`.tg-flow-line`) animates via CSS, motion-safe gated in globals.css.
 */
function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });
  const color = (data?.color as string | undefined) ?? '#94a3b8';
  const label = data?.label as string | undefined;
  // Spotlight dimming (hover) — the traveling-dash overlay fades with the base.
  const dimmed = Boolean(data?.dimmed);
  // Trace mode: on-path edges glow; the current hop edge carries a pulsing
  // signal riding the traveling dash toward the next node.
  const tracePath = Boolean(data?.tracePath);
  const traceStep = Boolean(data?.traceStep);

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {/* Animated flow overlay */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={traceStep ? 3 : tracePath ? 2.5 : 1.5}
        strokeLinecap="round"
        strokeDasharray="3 14"
        className="tg-flow-line pointer-events-none"
        opacity={dimmed ? 0.05 : traceStep ? 1 : tracePath ? 0.85 : 0.9}
        style={
          traceStep
            ? { filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.9))' }
            : tracePath
              ? { filter: 'drop-shadow(0 0 3px rgba(34,211,238,0.45))' }
              : undefined
        }
      />
      {/* Pulse riding the current trace hop */}
      {traceStep ? (
        <circle r={4} fill="#22d3ee" className="tg-trace-pulse pointer-events-none">
          <animateMotion dur="0.55s" repeatCount="indefinite" path={path} />
        </circle>
      ) : null}
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[10px]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color,
              borderColor: `${color}40`,
              backgroundColor: 'rgba(10, 10, 13, 0.85)',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const edgeTypes = {
  flow: FlowEdge,
};

/** Direct neighbors of `nodeId` over the returned edges (both directions). */
function directNeighbors(graphData: GraphResponse | null, nodeId: string | null): Set<string> {
  if (!nodeId || !graphData) return new Set();
  const set = new Set<string>();
  for (const e of graphData.edges) {
    if (e.source === nodeId) set.add(e.target);
    if (e.target === nodeId) set.add(e.source);
  }
  return set;
}

/**
 * Nodes that transitively depend on `nodeId` — inbound reachability over the
 * visible edges. This is the deterministic "what breaks if this is removed"
 * set (same semantics as the impact engine's dependents).
 */
function dependentsOf(graphData: GraphResponse | null, nodeId: string | null): Set<string> {
  if (!nodeId || !graphData) return new Set();
  const inbound = new Map<string, string[]>();
  for (const e of graphData.edges) {
    const list = inbound.get(e.target) ?? [];
    list.push(e.source);
    inbound.set(e.target, list);
  }
  const reachable = new Set<string>([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const src of inbound.get(current) ?? []) {
      if (!reachable.has(src)) {
        reachable.add(src);
        queue.push(src);
      }
    }
  }
  return reachable;
}

/**
 * The ordered, deduplicated hop edges of a traversal — the spine the trace
 * animation walks. Each entry is `{ source, target, step }` where step is the
 * hop index (0-based) at which the call/import fires, in trace order.
 * Direction matters: a path A → B only lights the A→B edge, never B→A.
 */
function traceHopEdges(traversal: TraversalResult | null): Array<{ source: string; target: string; step: number }> {
  if (!traversal) return [];
  const seen = new Set<string>();
  const hops: Array<{ source: string; target: string; step: number }> = [];
  for (const path of traversal.paths) {
    for (let i = 0; i + 1 < path.nodes.length; i += 1) {
      const source = path.nodes[i];
      const target = path.nodes[i + 1];
      const key = `${source}→${target}`;
      if (!seen.has(key)) {
        seen.add(key);
        hops.push({ source, target, step: hops.length });
      }
    }
  }
  return hops;
}

/** Node ids appearing on any trace path (the "lit" set during a trace). */
function tracePathNodeIds(traversal: TraversalResult | null): Set<string> {
  const set = new Set<string>();
  if (!traversal) return set;
  for (const path of traversal.paths) {
    for (const id of path.nodes) set.add(id);
  }
  return set;
}

/**
 * The trace overlay's extra nodes: path endpoints that the neighborhood query
 * didn't return (the explorer shows a structural tree; the call path lives at
 * the function level). They're laid out as a vertical call chain hanging off
 * the entry node, so the traveling dash always has a spine to ride.
 */
function traceOverlayNodes(
  traversal: TraversalResult | null,
  existingIds: Set<string>,
  entryId: string,
  entryPos: { x: number; y: number },
): Node[] {
  if (!traversal) return [];
  const nodes: Node[] = [];
  const placed = new Set<string>();
  const onPath = tracePathNodeIds(traversal);
  for (const path of traversal.paths) {
    for (let i = 0; i < path.nodes.length; i += 1) {
      const id = path.nodes[i];
      if (existingIds.has(id) || placed.has(id) || id === entryId) continue;
      placed.add(id);
      const ref = traversal.nodes.find((n) => n.id === id);
      nodes.push({
        id,
        type: 'custom',
        position: { x: entryPos.x, y: entryPos.y + 150 + i * 130 },
        data: {
          node: ref ?? { id, type: 'Function', label: id.split(':').pop() },
          isRoot: false,
          // Keep overlay nodes lit during a trace (the memo dims everything
          // off-path) and mark them so they can be styled as trace-only.
          tracePathNode: true,
        },
      });
    }
  }
  return nodes;
}

/** Segmented layout switcher — shared by the page header and the fullscreen bar. */
function LayoutSelector({
  layout,
  onChange,
}: {
  layout: GraphLayoutKey;
  onChange: (key: GraphLayoutKey) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Graph layout"
      className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs shrink-0"
    >
      <LayoutGrid className="mx-1.5 size-3.5 text-muted-foreground/70" aria-hidden />
      {GRAPH_LAYOUTS.map(({ key, label, title }) => {
        const Icon = key === 'rings' ? Target : key === 'flow' ? Layers : Orbit;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={layout === key}
            title={title}
            aria-label={`${label} layout`}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
              layout === key
                ? 'bg-background font-medium text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Segmented traversal-depth switcher — shared by the page header and fullscreen bar. */
function DepthSelector({ depth, onChange }: { depth: number; onChange: (d: number) => void }) {
  return (
    <div
      role="group"
      aria-label="Traversal depth"
      className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs shrink-0"
    >
      <GitFork className="mx-1.5 size-3.5 text-muted-foreground/70" aria-hidden />
      {[1, 2, 3].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          aria-pressed={depth === d}
          className={`rounded px-2.5 py-1 transition-colors ${
            depth === d
              ? 'bg-background font-medium text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {d} hop{d > 1 ? 's' : ''}
        </button>
      ))}
    </div>
  );
}

interface GraphCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseEnter: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseLeave: (event: React.MouseEvent, node: Node) => void;
  onSelectionChange: (params: { nodes: Array<{ id: string }> }) => void;
  onNodeDragStop: (event: MouseEvent | TouchEvent, node: Node) => void;
}

/**
 * The React Flow canvas — shared by the inline explorer and the fullscreen
 * overlay so both keep the identical graph behavior (drags, selection, pan,
 * hover spotlight).
 */
function GraphCanvas({
  nodes,
  edges,
  onNodeClick,
  onNodeDoubleClick,
  onNodeMouseEnter,
  onNodeMouseLeave,
  onSelectionChange,
  onNodeDragStop,
}: GraphCanvasProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      onSelectionChange={onSelectionChange}
      onNodeDragStop={onNodeDragStop}
      nodesDraggable
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      aria-label="Codebase neighborhood graph"
    >
      <Background color="var(--border)" gap={24} size={1} />
      <Controls className="!bg-card/90 !border-border !rounded-lg !shadow-md [&_button]:!bg-card/90 [&_button]:!text-muted-foreground [&_button:hover]:!bg-muted/60" />
      <MiniMap
        className="!bg-card/90 !border-border !rounded-lg"
        nodeColor={(n) => NODE_TYPE_HEX[(n.data.node as GraphNode)?.type] ?? '#94a3b8'}
        maskColor="rgba(0, 0, 0, 0.55)"
      />
    </ReactFlow>
  );
}

export function GraphExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeId = searchParams.get('node');
  const { getToken } = useGitHubSession();
  const { fitView } = useReactFlow();

  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  // React Flow's native selection (shift-click / box select) — used to
  // deep-link a whole selection into the PR blast-radius tool.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [depth, setDepth] = useState(1);
  const [layout, setLayout] = useState<GraphLayoutKey>(DEFAULT_GRAPH_LAYOUT);
  // User-dragged node positions, layered over the layout engine's output — the
  // canvas stays free-form once the user rearranges it. The overrides are keyed
  // to the arrangement they were made in (root · depth · layout), so a fresh
  // neighborhood / depth / layout automatically ignores stale drags.
  const [nodeOverrides, setNodeOverrides] = useState<{
    key: string;
    positions: Record<string, { x: number; y: number }>;
  } | null>(null);
  const arrangementKey = useMemo(
    () => `${graphData?.root.id ?? ''}:${depth}:${layout}`,
    [graphData, depth, layout],
  );
  // Fullscreen canvas mode — the explorer replaces the page chrome with a
  // distraction-free, viewport-filling graph (in-app, so it works even where
  // the browser Fullscreen API is unavailable, e.g. sandboxed iframes).
  const [fullscreen, setFullscreen] = useState(false);
  // Hover spotlight: the node under the cursor + its direct neighbors stay lit,
  // everything else fades — the neighborhood reads at a glance.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // What-if mode: simulate removing a node; everything that would break glows
  // red (deterministic inbound reachability over the visible neighborhood).
  const [whatIf, setWhatIf] = useState(false);
  const [whatIfNodeId, setWhatIfNodeId] = useState<string | null>(null);
  // Trace mode: pick an entry point and the actual call path is animated
  // hop-by-hop through the neighborhood — the traveling dash rides each
  // dependency edge in order, like a debugger flame path.
  const [trace, setTrace] = useState(false);
  const [traceEntryId, setTraceEntryId] = useState<string | null>(null);
  const [traceResult, setTraceResult] = useState<TraversalResult | null>(null);
  const [traceStep, setTraceStep] = useState(0);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  // The animation clock — advances one hop every 550ms while a trace is live.
  const traceHops = useMemo(
    () => traceHopEdges(traceResult),
    [traceResult],
  );
  useEffect(() => {
    if (!trace || !traceEntryId || traceHops.length === 0) return;
    const id = window.setInterval(() => {
      setTraceStep((s) => (s + 1) % traceHops.length);
    }, 550);
    return () => window.clearInterval(id);
  }, [trace, traceEntryId, traceHops.length]);

  const toggleTrace = useCallback(() => {
    setTrace((prev) => {
      if (prev) {
        setTraceEntryId(null);
        setTraceResult(null);
        setTraceError(null);
        setTraceStep(0);
      }
      return !prev;
    });
  }, []);

  // Picking an entry point fetches the real multi-hop traversal from the API.
  const handleTraceEntry = useCallback(
    async (node: GraphNode) => {
      setTraceEntryId(node.id);
      setTraceStep(0);
      setTraceResult(null);
      setTraceError(null);
      setTraceLoading(true);
      try {
        const token = await getToken();
        const result = await apiClient.getTraversal(
          node.id,
          { depth, direction: 'out', limit: 40 },
          token,
        );
        setTraceResult(result);
        setTraceStep(0);
      } catch (err) {
        setTraceError(err instanceof Error ? err.message : 'Failed to trace the call path');
      } finally {
        setTraceLoading(false);
      }
    },
    [depth, getToken],
  );

  // Esc exits fullscreen; the listener exists only while the mode is active.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      setSelectedIds(() => new Set()); // new neighborhood = new selection
      try {
        const token = await getToken();
        const data = await apiClient.getGraph(
          { rootId: nodeId ?? undefined, depth, limit: 40 + depth * 30 },
          token,
        );
        if (!ignore) {
          setGraphData(data);
          const root = data.nodes.find((n) => n.id === data.root.id) || data.nodes[0] || null;
          setSelectedNode(root);
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load graph data');
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [nodeId, getToken, refreshTrigger, depth]);

  // The deterministic "what breaks" set (excluding the removed node itself),
  // shared by the canvas styling and the simulation banner.
  const whatIfAffectedSet = useMemo(
    () => dependentsOf(graphData ?? null, whatIf ? whatIfNodeId : null),
    [graphData, whatIf, whatIfNodeId],
  );
  const whatIfAffectedCount = whatIf ? Math.max(0, whatIfAffectedSet.size - 1) : 0;
  const whatIfTargetLabel = whatIfNodeId
    ? (graphData?.nodes.find((n) => n.id === whatIfNodeId)?.label ?? whatIfNodeId)
    : null;

  const toggleWhatIf = useCallback(() => {
    setWhatIf((prev) => {
      if (prev) setWhatIfNodeId(null);
      return !prev;
    });
  }, []);

  // Convert graphData into ReactFlow nodes & edges. The node positions come
  // from the selected layout engine (rings / flow / force — see
  // lib/graph-layouts.ts); edges are layout-independent, so they are built
  // once here with the traveling-dash overlay + directional arrows. The same
  // memo also applies the hover spotlight and the what-if simulation styling.
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!graphData) return { rfNodes: [], rfEdges: [] };

    // Direct neighbors of the hovered node (both directions) — the "lit" set.
    const neighborSet = directNeighbors(graphData, hoveredNodeId);

    const whatIfAffected = whatIfAffectedSet;

    // Start from the layout engine's arrangement, then let any user drags win
    // (only for the current arrangement — stale drags are ignored).
    const activeOverrides =
      nodeOverrides && nodeOverrides.key === arrangementKey ? nodeOverrides.positions : {};
    const nodes = layoutGraph(graphData, depth, layout).map((n) => {
      const override = activeOverrides[n.id];
      const position = override ?? n.position;

      // What-if simulation wins over the hover spotlight and the trace.
      if (whatIf && whatIfAffected) {
        if (n.id === whatIfNodeId) {
          return {
            ...n,
            position,
            style: { opacity: 0.45, transition: 'opacity 200ms' },
            data: { ...n.data, whatIfStatus: 'removed' },
          };
        }
        if (whatIfAffected.has(n.id)) {
          return {
            ...n,
            position,
            data: { ...n.data, whatIfStatus: 'affected' },
          };
        }
      } else if (trace && traceEntryId && traceResult) {
        // Trace: everything off the call path fades so the animation reads.
        const onPath = tracePathNodeIds(traceResult);
        if (!onPath.has(n.id)) {
          return { ...n, position, style: { opacity: 0.22, transition: 'opacity 200ms' } };
        }
        if (n.id === traceEntryId) {
          return {
            ...n,
            position,
            style: { filter: 'drop-shadow(0 0 10px rgba(34,211,238,0.55))' },
            data: { ...n.data, traceEntry: true },
          };
        }
      } else if (hoveredNodeId) {
        const lit = hoveredNodeId === n.id || n.id === graphData.root.id || neighborSet.has(n.id);
        if (!lit) {
          return { ...n, position, style: { opacity: 0.3, transition: 'opacity 200ms' } };
        }
      }
      return { ...n, position };
    });

    // Trace animation state (only meaningful while a trace is live):
    //   traceActive — the entry point is set and the traversal is in hand;
    //   onPath / onStep — edge membership in the traced spine / current hop.
    const traceActive = Boolean(trace && traceEntryId && traceResult);
    const traceHopsActive = traceActive ? traceHops : [];
    const traceStepEdge = traceHopsActive[traceStep] ?? null;
    const hopByEdgeKey = new Map<string, number>();
    traceHopsActive.forEach((h, i) => hopByEdgeKey.set(`${h.source}→${h.target}`, i));

    const edges: Edge[] = graphData.edges.map((e) => {
      const color = REL_TYPE_HEX[e.type] ?? '#94a3b8';
      let dimmed = false;
      let red = false;
      if (whatIf && whatIfAffected) {
        // Dependency chains INTO the removed node are part of the breakage.
        red =
          e.source !== whatIfNodeId &&
          whatIfAffected.has(e.source) &&
          (e.target === whatIfNodeId || whatIfAffected.has(e.target));
      } else if (traceActive) {
        // Trace: only the traced spine stays lit — the current hop glows.
        dimmed = !hopByEdgeKey.has(`${e.source}→${e.target}`);
      } else if (hoveredNodeId) {
        dimmed = e.source !== hoveredNodeId && e.target !== hoveredNodeId;
      }
      const stroke = red ? '#f43f5e' : color;
      const traceOnPath = traceActive ? hopByEdgeKey.has(`${e.source}→${e.target}`) : false;
      const traceOnStep =
        traceActive &&
        traceStepEdge !== null &&
        e.source === traceStepEdge.source &&
        e.target === traceStepEdge.target;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'flow',
        data: { color: stroke, label: e.type, dimmed, tracePath: traceOnPath, traceStep: traceOnStep },
        style: {
          stroke: traceOnStep ? '#22d3ee' : stroke,
          strokeWidth: traceOnStep ? 3 : red ? 2 : 1.5,
          opacity: dimmed ? 0.12 : traceOnStep ? 1 : hoveredNodeId && !whatIf && !traceActive ? 0.9 : red ? 0.85 : 0.55,
          transition: 'opacity 200ms',
          filter: traceOnStep ? 'drop-shadow(0 0 6px rgba(34,211,238,0.8))' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: traceOnStep ? '#22d3ee' : stroke,
        },
      };
    });

    // Trace overlay: the neighborhood query only returns structural edges
    // (e.g. CONTAINS in a directory tree), so the real call path often isn't
    // drawn. While a trace is live, add the traversal's own edges AND the
    // path nodes the neighborhood didn't return (function-level call targets),
    // so the animated spine is always visible.
    if (traceActive && traceResult) {
      const entryNode = nodes.find((n) => n.id === traceEntryId);
      const entryPos = entryNode?.position ?? { x: 0, y: 0 };
      const existingIds = new Set(nodes.map((n) => n.id));
      const overlay = traceOverlayNodes(traceResult, existingIds, traceEntryId ?? '', entryPos);
      const onPath = tracePathNodeIds(traceResult);
      for (const on of overlay) {
        // The generic node pass above may have dimmed these as off-path;
        // overlay nodes ARE the path, so keep them lit with a trace tint.
        nodes.push({
          ...on,
          style: { opacity: 1, filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.4))' },
          data: { ...on.data, onPath: true },
        });
      }
      // Nodes already in the neighborhood but on the path get a subtle glow.
      for (const n of nodes) {
        if (!n.id.startsWith('trace-') && onPath.has(n.id)) {
          n.data = { ...n.data, onPath: true };
        }
      }
    }

    // Trace overlay edges: merge the traversal's CALLS edges in so the
    // animated spine is always visible — even when its endpoints are the
    // freshly added overlay nodes.
    if (traceActive && traceResult) {
      const existingKeys = new Set(edges.map((e) => `${e.source}→${e.target}`));
      let traceEdgeIdx = 0;
      for (const te of traceResult.edges) {
        const key = `${te.source}→${te.target}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        const color = REL_TYPE_HEX[te.type] ?? '#94a3b8';
        const traceOnPath = hopByEdgeKey.has(key);
        const traceOnStep =
          traceStepEdge !== null && te.source === traceStepEdge.source && te.target === traceStepEdge.target;
        // Unique ids — traversal edge ids collide with neighborhood ids, and
        // duplicate React keys break edge rendering.
        traceEdgeIdx += 1;
        edges.push({
          id: `trace-${te.id}-${traceEdgeIdx}`,
          source: te.source,
          target: te.target,
          type: 'flow',
          data: { color, label: te.type, dimmed: false, tracePath: traceOnPath, traceStep: traceOnStep },
          style: {
            stroke: traceOnStep ? '#22d3ee' : color,
            strokeWidth: traceOnStep ? 3 : 1.5,
            opacity: traceOnStep ? 1 : 0.85,
            transition: 'opacity 200ms',
            filter: traceOnStep ? 'drop-shadow(0 0 6px rgba(34,211,238,0.8))' : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: traceOnStep ? '#22d3ee' : color,
          },
        });
      }
    }

    if (traceActive) {
      // TEMP DEBUG
      console.log('[TRACE-EDGES]', edges.map((e) => e.id).join(', '));
      console.log('[TRACE-NODES]', nodes.map((n) => n.id).join(', '));
    }
    return { rfNodes: nodes, rfEdges: edges };
  }, [
    graphData,
    depth,
    layout,
    nodeOverrides,
    arrangementKey,
    hoveredNodeId,
    whatIf,
    whatIfNodeId,
    whatIfAffectedSet,
    trace,
    traceEntryId,
    traceResult,
    traceStep,
    traceHops,
  ]);

  const presentNodeTypes = useMemo(
    () => Array.from(new Set(graphData?.nodes.map((n) => n.type) ?? [])),
    [graphData],
  );
  const presentRelTypes = useMemo(
    () => Array.from(new Set(graphData?.edges.map((e) => e.type) ?? [])),
    [graphData],
  );

  // Stable selection handler. An inline arrow here would give React Flow a new
  // callback identity every render, making it re-subscribe and re-emit the
  // selection (then `setSelectedIds` schedules another render — an infinite
  // loop). The equality guard additionally no-ops when React Flow re-emits the
  // same selection, so the state only updates on a real change.
  const handleSelectionChange = useCallback(({ nodes }: { nodes: Array<{ id: string }> }) => {
    setSelectedIds((prev) => {
      const next = new Set(nodes.map((n) => n.id));
      if (prev.size === next.size) {
        let same = true;
        for (const id of next) {
          if (!prev.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, []);

  // File paths for the currently selected nodes — same resolution as the
  // single-node "Analyze PR" action, so a whole selection deep-links into the
  // blast-radius tool as one comma-separated `?blast=` value.
  const selectedBlastPaths = useMemo(() => {
    if (!graphData || selectedIds.size === 0) return [];
    return graphData.nodes
      .filter((n) => selectedIds.has(n.id))
      .map(
        (n) =>
          (n.properties?.filePath as string | undefined) ||
          (n.properties?.path as string | undefined) ||
          (n.type === 'File' ? n.label : undefined),
      )
      .filter((p): p is string => Boolean(p));
  }, [graphData, selectedIds]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const gn = graphData?.nodes.find((n) => n.id === node.id);
      if (!gn) return;
      setSelectedNode(gn);
      // In what-if mode a click picks (or unpicks) the simulated removal target.
      if (whatIf) {
        setWhatIfNodeId((prev) => (prev === node.id ? null : node.id));
      }
      // In trace mode a click picks the entry point and starts the animation.
      if (trace) {
        if (traceEntryId === node.id) {
          setTraceEntryId(null);
          setTraceResult(null);
          setTraceError(null);
          setTraceStep(0);
        } else {
          void handleTraceEntry(gn);
        }
      }
    },
    [graphData, whatIf, trace, traceEntryId, handleTraceEntry],
  );

  const handleNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    router.push(`/graph?node=${encodeURIComponent(node.id)}`);
  };

  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredNodeId(node.id);
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Persist the final dragged position so the rearrangement survives re-renders
  // (selection, details panel, etc.) instead of snapping back to the layout.
  // xyflow's onNodeDragStop takes the DOM event type (its click handlers take
  // the React synthetic one — inconsistent upstream typings). The event is
  // typed explicitly here and never actually used.
  const handleNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      setNodeOverrides((prev) => ({
        key: arrangementKey,
        positions: {
          // Keep drags from this arrangement; discard any from older ones.
          ...(prev && prev.key === arrangementKey ? prev.positions : {}),
          [node.id]: { x: node.position.x, y: node.position.y },
        },
      }));
    },
    [arrangementKey],
  );

  const hasNodeOverrides = Boolean(
    nodeOverrides && nodeOverrides.key === arrangementKey && Object.keys(nodeOverrides.positions).length > 0,
  );

  const isEmpty = !loading && !error && graphData !== null && graphData.nodes.length === 0;

  // Re-fit the viewport whenever a new neighborhood, depth change, or layout
  // switch re-renders the canvas.
  useEffect(() => {
    if (graphData && !loading) {
      const t = window.setTimeout(() => void fitView({ padding: 0.2, duration: 350 }), 60);
      return () => window.clearTimeout(t);
    }
  }, [graphData, loading, depth, layout, fitView]);

  // ── Fullscreen mode: the explorer replaces the page chrome with a
  // viewport-filling canvas + floating controls. The page header is not
  // rendered at all here, so there are no duplicate controls behind the
  // overlay.
  if (fullscreen && graphData && !loading && !error && !isEmpty) {
    return (
      <div
        role="region"
        aria-label="Graph Explorer fullscreen"
        className="fixed inset-0 z-50 flex flex-col bg-background"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.06),transparent_65%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        {/* Canvas fills the whole viewport */}
        <div className="absolute inset-0">
          <GraphCanvas
            nodes={rfNodes}
            edges={rfEdges}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
            onSelectionChange={handleSelectionChange}
            onNodeDragStop={handleNodeDragStop}
          />
        </div>

        {/* What-if simulation banner */}
        {whatIf ? (
          <div
            role="status"
            className="absolute left-1/2 top-14 z-20 flex w-full max-w-xl -translate-x-1/2 items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-background/90 px-3 py-2 backdrop-blur"
          >
            <p className="truncate text-xs text-foreground/90">
              {whatIfNodeId ? (
                <>
                  Removing{' '}
                  <code className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-300">
                    {whatIfTargetLabel}
                  </code>{' '}
                  — <span className="font-medium text-rose-300">{whatIfAffectedCount}</span>{' '}
                  {whatIfAffectedCount === 1 ? 'node' : 'nodes'} would break
                </>
              ) : (
                <>Pick a node to simulate its removal</>
              )}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleWhatIf}
              className="h-7 shrink-0 text-xs gap-1.5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
            >
              Stop
            </Button>
          </div>
        ) : null}

        {/* Floating control bar */}
        <div className="absolute left-1/2 top-3 z-20 flex w-full max-w-2xl -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-3">
          <LayoutSelector layout={layout} onChange={setLayout} />
          <DepthSelector depth={depth} onChange={setDepth} />
          {hasNodeOverrides ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNodeOverrides(null)}
              className="h-8 text-xs gap-1.5 bg-background/80 backdrop-blur"
              title="Restore the auto-layout positions"
            >
              <RotateCcw className="size-3.5" />
              Reset layout
            </Button>
          ) : null}
          <Button
            variant={trace ? 'default' : 'outline'}
            size="sm"
            onClick={toggleTrace}
            aria-pressed={trace}
            className="h-8 text-xs gap-1.5 bg-background/80 backdrop-blur data-[pressed=true]:bg-cyan-500/15 data-[pressed=true]:text-cyan-300 data-[pressed=true]:border-cyan-500/40"
            title="Trace the call path from an entry point — animates hop by hop"
          >
            <Waypoints className="size-3.5" />
            Trace
          </Button>
          <Button
            variant={whatIf ? 'default' : 'outline'}
            size="sm"
            onClick={toggleWhatIf}
            aria-pressed={whatIf}
            className="h-8 text-xs gap-1.5 bg-background/80 backdrop-blur"
            title="Simulate removing a node — everything that would break glows red"
          >
            <FlaskConical className="size-3.5" />
            What-if
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="h-8 text-xs gap-1.5 bg-background/80 backdrop-blur"
          >
            <Search className="size-3.5" />
            Search
          </Button>
        </div>

        {/* Trace animation banner */}
        {trace ? (
          <div
            role="status"
            className="absolute left-1/2 top-14 z-20 flex w-full max-w-xl -translate-x-1/2 items-center justify-between gap-3 rounded-lg border border-cyan-500/30 bg-background/90 px-3 py-2 backdrop-blur"
          >
            <p className="flex items-center gap-2 truncate text-xs text-foreground/90">
              <Waypoints className="size-3.5 shrink-0 text-cyan-400" aria-hidden />
              {traceError ? (
                <span className="text-rose-300">Could not trace the call path.</span>
              ) : traceLoading ? (
                <span>Resolving call path from the entry point…</span>
              ) : !traceEntryId ? (
                <span>Pick an entry point — its call path animates hop by hop.</span>
              ) : traceResult && traceHops.length === 0 ? (
                <span>
                  No outgoing call path from{' '}
                  <code className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-cyan-300">
                    {traceResult.root.label}
                  </code>{' '}
                  at {depth} hop{depth === 1 ? '' : 's'}.
                </span>
              ) : traceResult ? (
                <span>
                  Tracing{' '}
                  <code className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-cyan-300">
                    {traceResult.root.label}
                  </code>{' '}
                  — step <span className="font-medium text-cyan-300">{traceStep + 1}</span>/
                  {traceHops.length}
                </span>
              ) : null}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTrace}
              className="h-7 shrink-0 text-xs gap-1.5 text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200"
            >
              Stop
            </Button>
          </div>
        ) : null}

        {/* Meta + exit */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          <span className="rounded-md border border-border/50 bg-card/85 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm">
            {graphData.nodes.length} nodes · {graphData.edges.length} relationships
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setFullscreen(false)}
            aria-label="Exit fullscreen"
            title="Exit fullscreen (Esc)"
            className="size-8 bg-background/85 backdrop-blur"
          >
            <Minimize className="size-4" />
          </Button>
        </div>

        {/* Node details panel floats bottom-right */}
        {selectedNode ? (
          <div className="absolute bottom-4 right-4 z-20 w-80 max-w-[calc(100%-2rem)]">
            <NodeDetailsPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
          </div>
        ) : null}

        {/* Compact legend bottom-center */}
        <div className="absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-md border border-border/50 bg-card/85 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm md:flex">
          {presentNodeTypes.map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ background: NODE_TYPE_HEX[t] ?? '#94a3b8' }}
              />
              {t}
            </span>
          ))}
          {presentNodeTypes.length > 0 && presentRelTypes.length > 0 ? (
            <span aria-hidden className="hidden h-3 w-px bg-border sm:block" />
          ) : null}
          {presentRelTypes.map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ background: REL_TYPE_HEX[t] ?? '#94a3b8' }}
              />
              {t}
            </span>
          ))}
        </div>

        {/* Escape hint */}
        <p className="absolute bottom-4 left-4 z-20 hidden rounded-md border border-border/50 bg-card/85 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm lg:block">
          Esc to exit · Drag nodes · Scroll zoom
        </p>

        <EntitySearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelect={(id) => router.push(`/graph?node=${encodeURIComponent(id)}`)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-[0_0_16px_-2px_rgba(56,189,248,0.45)]">
            <Network className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {GRAPH_LAYOUTS.find((l) => l.key === layout)?.viewLabel ?? 'Radial'} view ·{' '}
              {depth}-hop neighborhood
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Graph Explorer</h1>
            <p className="text-xs text-muted-foreground">
              Click a node to inspect; double-click to focus.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LayoutSelector layout={layout} onChange={setLayout} />
          <DepthSelector depth={depth} onChange={setDepth} />

          {hasNodeOverrides ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNodeOverrides(null)}
              className="h-8 text-xs gap-1.5"
              title="Restore the auto-layout positions"
            >
              <RotateCcw className="size-3.5" />
              Reset layout
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="h-8 text-xs gap-1.5"
          >
            <Search className="size-3.5" />
            Search symbol
          </Button>
          {graphData && !loading && !error && !isEmpty ? (
            <>
              <Button
                variant={trace ? 'default' : 'outline'}
                size="sm"
                onClick={toggleTrace}
                aria-pressed={trace}
                className={`h-8 text-xs gap-1.5 ${trace ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200' : ''}`}
                title="Trace the call path from an entry point — animates hop by hop"
              >
                <Waypoints className="size-3.5" />
                Trace
              </Button>
              <Button
                variant={whatIf ? 'default' : 'outline'}
                size="sm"
                onClick={toggleWhatIf}
                aria-pressed={whatIf}
                className="h-8 text-xs gap-1.5"
                title="Simulate removing a node — everything that would break glows red"
              >
                <FlaskConical className="size-3.5" />
                What-if
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFullscreen(true)}
                className="h-8 text-xs gap-1.5"
                title="Expand the graph to fill the screen (Esc to exit)"
              >
                <Maximize className="size-3.5" />
                Fullscreen
              </Button>
            </>
          ) : null}
          {selectedBlastPaths.length > 1 ? (
            <Link
              href={`/intelligence?blast=${encodeURIComponent(selectedBlastPaths.join(','))}`}
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className:
                  'h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-500 hover:border-emerald-500/70 hover:bg-emerald-500/10 hover:text-emerald-400',
              })}
              title="Pre-fill the PR blast-radius tool with every selected file"
            >
              <GitCompareArrows className="size-3.5" />
              Analyze PR ({selectedBlastPaths.length})
            </Link>
          ) : null}
          {selectedNode ? (
            <>
              <Link
                href={`/impact?node=${encodeURIComponent(selectedNode.id)}`}
                className={buttonVariants({ size: 'sm', className: 'h-8 text-xs gap-1.5' })}
              >
                <Radar className="size-3.5" />
                Analyze Impact
              </Link>
              {(() => {
                const blastPath =
                  (selectedNode.properties?.filePath as string | undefined) ||
                  (selectedNode.properties?.path as string | undefined) ||
                  (selectedNode.type === 'File' ? selectedNode.label : undefined);
                return blastPath ? (
                  <Link
                    href={`/intelligence?blast=${encodeURIComponent(blastPath)}`}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                      className:
                        'h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-500 hover:border-emerald-500/70 hover:bg-emerald-500/10 hover:text-emerald-400',
                    })}
                    title="Pre-fill the PR blast-radius tool with this file"
                  >
                    <GitCompareArrows className="size-3.5" />
                    Analyze PR
                  </Link>
                ) : null;
              })()}
              <Link
                href={`/dependencies?node=${encodeURIComponent(selectedNode.id)}`}
                className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-8 text-xs gap-1.5' })}
              >
                <Workflow className="size-3.5" />
                Explore Dependencies
                <ArrowRight className="size-3" />
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* Trace animation banner */}
      {trace ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5"
        >
          <p className="flex items-center gap-2 text-xs text-foreground/90">
            <Waypoints className="size-3.5 shrink-0 text-cyan-400" aria-hidden />
            {traceError ? (
              <span className="text-rose-300">Could not trace the call path.</span>
            ) : traceLoading ? (
              <span>Resolving call path from the entry point…</span>
            ) : !traceEntryId ? (
              <>
                Pick an entry point — its <span className="font-medium text-cyan-300">actual call path</span>{' '}
                animates hop by hop ({depth} hop{depth === 1 ? '' : 's'} deep). Click a node to start.
              </>
            ) : traceResult && traceHops.length === 0 ? (
              <>
                No outgoing call path from{' '}
                <code className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-cyan-300">
                  {traceResult.root.label}
                </code>{' '}
                at {depth} hop{depth === 1 ? '' : 's'}.
              </>
            ) : traceResult ? (
              <>
                Tracing{' '}
                <code className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-cyan-300">
                  {traceResult.root.label}
                </code>{' '}
                — step <span className="font-medium text-cyan-300">{traceStep + 1}</span>/
                {traceHops.length}. Click another node to switch the entry point.
              </>
            ) : null}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTrace}
            className="h-7 text-xs gap-1.5 text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200"
          >
            Stop trace
          </Button>
        </div>
      ) : null}

      {/* What-if simulation banner */}
      {whatIf ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-2.5"
        >
          <p className="flex items-center gap-2 text-xs text-foreground/90">
            <FlaskConical className="size-3.5 shrink-0 text-rose-400" aria-hidden />
            {whatIfNodeId ? (
              <>
                Simulating removal of{' '}
                <code className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-300">
                  {whatIfTargetLabel}
                </code>{' '}
                — <span className="font-medium text-rose-300">{whatIfAffectedCount}</span> visible{' '}
                {whatIfAffectedCount === 1 ? 'node' : 'nodes'} would break. Click another node to
                switch targets.
              </>
            ) : (
              <>
                Pick a node to simulate its removal — everything that would break glows red.
              </>
            )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleWhatIf}
            className="h-7 text-xs gap-1.5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
          >
            Stop simulation
          </Button>
        </div>
      ) : null}

      {/* Main Visual Canvas Container — height expands with traversal depth */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-background/50 shadow-inner">
        <div
          className={`relative w-full ${depth === 1 ? 'h-[560px]' : depth === 2 ? 'h-[680px]' : 'h-[800px]'}`}
        >
          {loading ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <Skeleton className="size-20 rounded-full" />
                  <Skeleton className="absolute inset-2.5 rounded-full" />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Skeleton className="h-3 w-44" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <p className="text-xs text-muted-foreground">Loading graph neighborhood…</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full w-full items-center justify-center p-6">
              <div className="w-full max-w-md">
                <SectionError
                  title="Couldn't load the graph"
                  message={error}
                  onRetry={() => setRefreshTrigger((c) => c + 1)}
                />
              </div>
            </div>
          ) : isEmpty ? (
            <div className="flex h-full w-full items-center justify-center p-6 text-center">
              <div className="flex max-w-sm flex-col items-center gap-3">
                <Network className="size-6 text-muted-foreground/60" aria-hidden />
                <p className="text-sm font-medium text-foreground">No nodes in this neighborhood</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The graph returned no entities for the current root. Try searching for a symbol or
                  picking a different component.
                </p>
                <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)}>
                  <Search className="size-3.5 mr-1" />
                  Search symbols
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Ambient glow + top highlight */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.06),transparent_65%)]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
              />

              <div className="absolute inset-0">
                <GraphCanvas
                  nodes={rfNodes}
                  edges={rfEdges}
                  onNodeClick={handleNodeClick}
                  onNodeDoubleClick={handleNodeDoubleClick}
                  onNodeMouseEnter={handleNodeMouseEnter}
                  onNodeMouseLeave={handleNodeMouseLeave}
                  onSelectionChange={handleSelectionChange}
                  onNodeDragStop={handleNodeDragStop}
                />
              </div>

              {/* Floating metadata chips */}
              <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-border/50 bg-card/85 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm">
                {graphData?.nodes.length ?? 0} nodes · {graphData?.edges.length ?? 0} relationships
              </div>
              <div className="pointer-events-none absolute right-3 top-3 z-10 hidden rounded-md border border-border/50 bg-card/85 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm md:block">
                Click inspect · Drag nodes · Shift-click select · Double-click focus · Drag pan · Scroll zoom
              </div>

              {/* Float details panel on the bottom-right */}
              {selectedNode ? (
                <div className="absolute bottom-4 right-4 z-10 w-80 max-w-[calc(100%-2rem)]">
                  <NodeDetailsPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Legend — built from the types actually present in the response */}
        {!loading && !error && !isEmpty && graphData ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/60 bg-muted/30 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {presentNodeTypes.map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ background: NODE_TYPE_HEX[t] ?? '#94a3b8' }}
                />
                {t}
              </span>
            ))}
            {presentNodeTypes.length > 0 && presentRelTypes.length > 0 ? (
              <span aria-hidden className="hidden h-3 w-px bg-border sm:block" />
            ) : null}
            {presentRelTypes.map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-3 rounded-full"
                  style={{ background: REL_TYPE_HEX[t] ?? '#94a3b8' }}
                />
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <EntitySearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(id) => router.push(`/graph?node=${encodeURIComponent(id)}`)}
      />
    </div>
  );
}
