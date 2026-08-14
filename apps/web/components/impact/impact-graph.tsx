'use client';

import { useMemo } from 'react';
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
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphNodeRef, ImpactResponse } from '@tracegraph/shared';
import { NodeTypeIcon } from '@/components/dependencies/relationship-badge';
import { selectedPathEdgeKeys, selectedPathNodeIds } from '@/components/impact/impact-path-selection';

/** Node-type → hex accents, mirroring the rest of the app. */
const NODE_HEX: Record<string, string> = {
  Class: '#34d399',
  Function: '#a78bfa',
  File: '#38bdf8',
  Test: '#fbbf24',
  Commit: '#22d3ee',
  PullRequest: '#c084fc',
  Issue: '#fb7185',
};

const REL_HEX: Record<string, string> = {
  CALLS: '#a78bfa',
  IMPORTS: '#38bdf8',
  EXTENDS: '#34d399',
  TESTS: '#fbbf24',
  CONTAINS: '#818cf8',
};

/** Impact badge color by category: root / direct / indirect. */
const IMPACT_ACCENT: Record<'root' | 'direct' | 'indirect', string> = {
  root: 'linear-gradient(135deg, #0ea5e9, #4f46e5)',
  direct: '#38bdf8',
  indirect: '#a78bfa',
};

function ImpactNode({ data, selected }: NodeProps) {
  const ref = data.ref as GraphNodeRef;
  const kind = data.kind as 'root' | 'direct' | 'indirect';
  const isRoot = kind === 'root';
  const isSelected = selected || data.selected === true;
  // A chain member of the selected path (not the anchor itself).
  const isHighlighted = !isRoot && !isSelected && data.highlighted === true;
  const hex = NODE_HEX[ref.type] ?? '#94a3b8';

  return (
    <div
      className={`flex min-w-36 max-w-52 flex-col gap-1 rounded-xl border p-2.5 shadow-md transition-all ${
        isRoot
          ? 'border-sky-500/50 bg-card ring-2 ring-sky-500/25'
          : isSelected
            ? 'bg-card ring-2'
            : isHighlighted
              ? 'border-sky-500/40 bg-card/95 ring-1 ring-sky-500/40'
              : 'border-border/80 bg-card/90'
      }`}
      style={!isRoot && (isSelected || isHighlighted) ? { borderColor: hex } : undefined}
    >
      <Handle type="target" position={Position.Top} className="size-2 !bg-muted-foreground/70" />
      <div className="flex items-center gap-2">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-md"
          style={
            isRoot
              ? { background: IMPACT_ACCENT.root }
              : { backgroundColor: `${hex}1f`, color: hex }
          }
        >
          <NodeTypeIcon type={ref.type} className="size-3" />
        </span>
        <span className="truncate text-[11px] font-semibold text-foreground" title={ref.label}>
          {ref.label}
        </span>
      </div>
      <div className="flex items-center justify-between gap-1">
        <span
          className="font-mono text-[8px] uppercase tracking-widest"
          style={{ color: isRoot ? '#38bdf8' : hex }}
        >
          {isRoot ? 'Root' : kind === 'direct' ? 'Direct' : 'Indirect'}
        </span>
        {isRoot ? (
          <span className="font-mono text-[8px] font-bold uppercase text-sky-400">Focus</span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="size-2 !bg-muted-foreground/70" />
    </div>
  );
}

const nodeTypes = { impact: ImpactNode };

/** Edge with the animated data-flow overlay, matching the graph explorer. */
function ImpactFlowEdge({
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
  const emphasized = data?.emphasized === true;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={emphasized ? 2.5 : 1.5}
        strokeLinecap="round"
        strokeDasharray="3 14"
        className="tg-flow-line pointer-events-none"
        opacity={emphasized ? 1 : 0.9}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[9px]"
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

const edgeTypes = { flow: ImpactFlowEdge };

interface ImpactGraphProps {
  response: ImpactResponse;
  selectedPathId: string | null;
  onSelectPath: (id: string | null) => void;
}

function ImpactGraphInner({ response, selectedPathId, onSelectPath }: ImpactGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const rfNodes: Node[] = [];
    const rfEdges: Edge[] = [];
    const placed = new Set<string>();
    let edgeIndex = 0;

    // Full-chain selection: when an entity is selected, every node and edge on
    // its evidence chain (affected → … → root) is emphasized, not just the
    // anchor entity (Phase 10 §15).
    const pathNodes = selectedPathNodeIds(response, selectedPathId);
    const pathEdges = selectedPathEdgeKeys(response, selectedPathId);

    const root = response.root;
    const center = { x: 320, y: 220 };
    rfNodes.push({
      id: root.id,
      type: 'impact',
      position: center,
      data: { ref: root, kind: 'root' },
    });
    placed.add(root.id);

    // Direct ring at radius 180; indirect at 340.
    const direct = response.directImpact;
    const indirect = response.indirectImpact;
    const placeRing = (items: typeof direct, radius: number, kind: 'direct' | 'indirect') => {
      items.forEach((entity, idx) => {
        if (placed.has(entity.id)) return;
        const angle = (idx / Math.max(1, items.length)) * 2 * Math.PI - Math.PI / 2;
        rfNodes.push({
          id: entity.id,
          type: 'impact',
          position: {
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle),
          },
          data: {
            ref: entity,
            kind,
            selected: selectedPathId === entity.id,
            highlighted: pathNodes?.has(entity.id) ?? false,
          },
        });
        placed.add(entity.id);
      });
    };
    placeRing(direct, 180, 'direct');
    placeRing(indirect, 340, 'indirect');

    // Edges from every impacted entity toward the root (through its path).
    const pushEdge = (from: string, to: string, type: string, color: string) => {
      const onPath = pathEdges.has(`${from}::${to}`);
      edgeIndex += 1;
      rfEdges.push({
        id: `e-${edgeIndex}`,
        source: from,
        target: to,
        type: 'flow',
        data: { color, label: type, emphasized: onPath },
        style: {
          stroke: color,
          strokeWidth: onPath ? 2.5 : 1.5,
          opacity: onPath ? 1 : 0.55,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: onPath ? 14 : 12, height: onPath ? 14 : 12, color },
      });
    };
    for (const entity of [...direct, ...indirect]) {
      const pathNodes = entity.path.nodes;
      for (let i = 0; i < pathNodes.length - 1; i += 1) {
        const from = pathNodes[i].id;
        const to = pathNodes[i + 1].id;
        const rel = entity.path.relTypes[i] ?? entity.relationship;
        pushEdge(from, to, rel, REL_HEX[rel] ?? '#94a3b8');
      }
    }

    return { nodes: rfNodes, edges: rfEdges };
  }, [response, selectedPathId]);

  return (
    <div className="relative h-[480px] overflow-hidden rounded-2xl border border-border/80 bg-background/50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.06),transparent_65%)]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="absolute inset-0">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => onSelectPath(node.id === response.root.id ? null : node.id)}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.2}
            maxZoom={2}
            aria-label="Impact graph"
          >
            <Background color="var(--border)" gap={24} size={1} />
            <Controls className="!bg-card/90 !border-border !rounded-lg !shadow-md [&_button]:!bg-card/90 [&_button]:!text-muted-foreground [&_button:hover]:!bg-muted/60" />
            <MiniMap
              className="!bg-card/90 !border-border !rounded-lg"
              nodeColor={(n) => (n.id === response.root.id ? '#38bdf8' : NODE_HEX[(n.data.ref as GraphNodeRef)?.type] ?? '#94a3b8')}
              maskColor="rgba(0, 0, 0, 0.55)"
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/50 bg-card/85 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-400" /> Root
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#38bdf8]" /> Direct
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#a78bfa]" /> Indirect
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-[#fbbf24]" /> Tests
        </span>
      </div>
    </div>
  );
}

export function ImpactGraph(props: ImpactGraphProps) {
  return <ImpactGraphInner {...props} />;
}
