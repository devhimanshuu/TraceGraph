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
  GitCompareArrows,
  GitFork,
  LayoutGrid,
  Layers,
  Network,
  Orbit,
  Radar,
  Search,
  Target,
  Workflow,
} from 'lucide-react';
import { useGitHubSession } from '@/hooks/use-github-session';
import type { GraphNode, GraphResponse } from '@tracegraph/shared';
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
  const typeHex = NODE_TYPE_HEX[node?.type ?? 'Class'] ?? '#94a3b8';

  return (
    <div
      className={`group flex min-w-40 max-w-56 flex-col gap-1 rounded-xl border p-3 shadow-md transition-all ${
        isRoot
          ? 'border-sky-500/50 bg-card ring-2 ring-sky-500/25'
          : selected
            ? 'bg-card ring-2 ring-muted-foreground/30'
            : 'border-border/80 bg-card/90 hover:border-border hover:bg-card'
      }`}
      style={!isRoot && selected ? { borderColor: typeHex } : undefined}
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
        {isRoot ? (
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

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {/* Animated flow overlay */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="3 14"
        className="tg-flow-line pointer-events-none"
        opacity={0.9}
      />
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

  // Convert graphData into ReactFlow nodes & edges. The node positions come
  // from the selected layout engine (rings / flow / force — see
  // lib/graph-layouts.ts); edges are layout-independent, so they are built
  // once here with the traveling-dash overlay + directional arrows.
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!graphData) return { rfNodes: [], rfEdges: [] };

    const nodes = layoutGraph(graphData, depth, layout);

    const edges: Edge[] = graphData.edges.map((e) => {
      const color = REL_TYPE_HEX[e.type] ?? '#94a3b8';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'flow',
        data: { color, label: e.type },
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.55 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color,
        },
      };
    });

    return { rfNodes: nodes, rfEdges: edges };
  }, [graphData, depth, layout]);

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

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    const gn = graphData?.nodes.find((n) => n.id === node.id);
    if (gn) {
      setSelectedNode(gn);
    }
  };

  const handleNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    router.push(`/graph?node=${encodeURIComponent(node.id)}`);
  };

  const isEmpty = !loading && !error && graphData !== null && graphData.nodes.length === 0;

  // Re-fit the viewport whenever a new neighborhood, depth change, or layout
  // switch re-renders the canvas.
  useEffect(() => {
    if (graphData && !loading) {
      const t = window.setTimeout(() => void fitView({ padding: 0.2, duration: 350 }), 60);
      return () => window.clearTimeout(t);
    }
  }, [graphData, loading, depth, layout, fitView]);

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
          {/* Layout selector */}
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
                  onClick={() => setLayout(key)}
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

          {/* Depth selector */}
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
                onClick={() => setDepth(d)}
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="h-8 text-xs gap-1.5"
          >
            <Search className="size-3.5" />
            Search symbol
          </Button>
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
                <ReactFlow
                  nodes={rfNodes}
                  edges={rfEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodeClick={handleNodeClick}
                  onNodeDoubleClick={handleNodeDoubleClick}
                  onSelectionChange={handleSelectionChange}
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
              </div>

              {/* Floating metadata chips */}
              <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-border/50 bg-card/85 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm">
                {graphData?.nodes.length ?? 0} nodes · {graphData?.edges.length ?? 0} relationships
              </div>
              <div className="pointer-events-none absolute right-3 top-3 z-10 hidden rounded-md border border-border/50 bg-card/85 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm md:block">
                Click inspect · Shift-click select · Double-click focus · Drag pan · Scroll zoom
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
