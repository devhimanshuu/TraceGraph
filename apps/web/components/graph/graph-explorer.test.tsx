import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GraphNode, GraphResponse } from '@tracegraph/shared';
import { GraphExplorer } from './graph-explorer';

// ── React Flow mock: renders children (so custom nodes render real labels) and
// exposes the props for interaction tests (onNodeClick). Node positions/styles
// and edges are captured so layout, spotlight, and what-if tests can assert
// the canvas actually re-renders.
const reactFlowProps: Record<string, unknown> = {};
const reactFlowNodePositions: Array<{
  id: string;
  position: { x: number; y: number };
  style?: Record<string, unknown>;
  data?: unknown;
}> = [];
const reactFlowEdges: Array<{
  id: string;
  source: string;
  target: string;
  style?: Record<string, unknown>;
  data?: unknown;
}> = [];
vi.mock('@xyflow/react', () => {
  const rf = ({
    children,
    nodes = [],
    edges = [],
    nodeTypes = {},
    onNodeClick,
    ...props
  }: {
    children: React.ReactNode;
    nodes?: Array<{
      id: string;
      type: string;
      data: unknown;
      selected?: boolean;
      position: { x: number; y: number };
      style?: Record<string, unknown>;
    }>;
    edges?: Array<{
      id: string;
      source: string;
      target: string;
      style?: Record<string, unknown>;
      data?: unknown;
    }>;
    nodeTypes?: Record<string, (p: { data: unknown; selected?: boolean }) => React.ReactNode>;
    onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
  }) => {
    Object.assign(reactFlowProps, props);
    reactFlowNodePositions.splice(
      0,
      reactFlowNodePositions.length,
      ...nodes.map((n) => ({ id: n.id, position: n.position, style: n.style, data: n.data })),
    );
    reactFlowEdges.splice(0, reactFlowEdges.length, ...edges);
    return (
      <div data-testid="react-flow">
        {nodes.map((n) => {
          const Comp = nodeTypes[n.type] ?? nodeTypes.custom;
          return Comp ? (
            <div
              key={n.id}
              data-node-id={n.id}
              onClick={() => onNodeClick?.({} as React.MouseEvent, { id: n.id })}
            >
              {Comp({ data: n.data, selected: n.selected })}
            </div>
          ) : null;
        })}
        {children}
      </div>
    );
  };
  rf.displayName = 'ReactFlow';
  return {
    ReactFlow: rf,
    useReactFlow: () => ({ fitView: vi.fn(), getNodes: () => [], getEdges: () => [] }),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    getBezierPath: () => ['M 0 0', 0, 0],
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getGraph: vi.fn(),
    getNode: vi.fn(),
    getTraversal: vi.fn(),
  },
  ApiRequestError: class extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  isAuthErrorMessage: () => false,
}));

vi.mock('@/components/dependencies/entity-search-dialog', () => ({
  EntitySearchDialog: () => <div data-testid="search-dialog" />,
}));

vi.mock('@/lib/services/intelligence.service', () => ({
  intelligenceService: {
    getKnowledge: vi.fn().mockResolvedValue({
      repo: { id: 'repo:commerce-platform', type: 'Repository', label: 'commerce-platform' },
      entity: null,
      owners: [],
    }),
  },
}));

import { apiClient } from '@/lib/api-client';
import { ApiRequestError } from '@/lib/api-client';

const ROOT: GraphNode = {
  id: 'fn:a.ts:Root',
  type: 'Class',
  label: 'Root',
  properties: {},
};
const NEIGHBOR: GraphNode = {
  id: 'fn:b.ts:Neighbor',
  type: 'Function',
  label: 'Neighbor',
  properties: {},
};

function graphResponse(nodes: GraphNode[] = [ROOT, NEIGHBOR]): GraphResponse {
  return {
    root: { id: ROOT.id, type: ROOT.type, label: ROOT.label },
    depth: 1,
    nodes,
    edges: [
      {
        id: 'e1',
        source: ROOT.id,
        target: NEIGHBOR.id,
        type: 'CALLS',
        properties: {},
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(reactFlowProps).forEach((k) => delete reactFlowProps[k]);
  reactFlowNodePositions.splice(0, reactFlowNodePositions.length);
  reactFlowEdges.splice(0, reactFlowEdges.length);
  vi.mocked(apiClient.getGraph).mockResolvedValue(graphResponse());
  vi.mocked(apiClient.getNode).mockResolvedValue(ROOT);
  vi.mocked(apiClient.getTraversal).mockResolvedValue({
    root: { id: ROOT.id, type: ROOT.type, label: ROOT.label },
    depth: 1,
    nodes: [
      { ...ROOT, hops: 0 },
      { ...NEIGHBOR, hops: 1 },
    ],
    edges: [
      { id: 't1', source: ROOT.id, target: NEIGHBOR.id, type: 'CALLS', properties: {} },
    ],
    paths: [{ nodes: [ROOT.id, NEIGHBOR.id], relTypes: ['CALLS'] }],
  });
});

describe('GraphExplorer', () => {
  it('loads the neighborhood and renders the root and neighbor nodes', async () => {
    render(<GraphExplorer />);

    // 'Root' appears in both the canvas node and the details panel.
    await waitFor(() => expect(screen.getAllByText('Root').length).toBeGreaterThan(0));
    expect(
      within(screen.getByTestId('react-flow')).getByText('Root'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('react-flow')).getByText('Neighbor'),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 nodes · 1 relationships/)).toBeInTheDocument();
    expect(apiClient.getGraph).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 1, limit: 70 }),
      'test-token',
    );
  });

  it('selects a node on click and shows its details panel', async () => {
    render(<GraphExplorer />);
    await waitFor(() => expect(screen.getAllByText('Root').length).toBeGreaterThan(0));

    // The details panel for the initially selected root is visible…
    expect((await screen.findAllByText('Explore Dependencies')).length).toBeGreaterThan(0);

    // …and clicking a different node updates the selection: the label now
    // appears in both the canvas node and the details panel.
    fireEvent.click(
      within(screen.getByTestId('react-flow')).getByText('Neighbor'),
    );

    await waitFor(() =>
      expect(screen.getAllByText('Neighbor').length).toBe(2),
    );
    expect(apiClient.getNode).not.toHaveBeenCalled();
  });

  it('shows the top committer chip for the selected node', async () => {
    const { intelligenceService } = await import('@/lib/services/intelligence.service');
    vi.mocked(intelligenceService.getKnowledge).mockResolvedValue({
      repo: { id: 'repo:commerce-platform', type: 'Repository', label: 'commerce-platform' },
      entity: { id: ROOT.id, type: 'Class', label: 'Root' },
      owners: [
        {
          developer: { id: 'developer:dev1', type: 'Developer', label: 'dev1' },
          commits: 14,
          lastCommit: '2025-03-05T00:00:00.000Z',
        },
      ],
    });

    render(<GraphExplorer />);
    await waitFor(() => expect(screen.getAllByText('Root').length).toBeGreaterThan(0));

    const chip = await screen.findByTestId('top-committer-chip');
    expect(chip).toHaveTextContent('dev1');
    expect(chip).toHaveTextContent('14 commits');
    expect(intelligenceService.getKnowledge).toHaveBeenCalledWith(
      { entityId: ROOT.id, limit: 3 },
      'test-token',
    );
  });

  it('re-fetches with a deeper traversal when the depth selector changes', async () => {
    render(<GraphExplorer />);
    await waitFor(() => expect(screen.getAllByText('Root').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: '2 hops' }));

    await waitFor(() =>
      expect(apiClient.getGraph).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 2, limit: 100 }),
        'test-token',
      ),
    );
  });

  it('shows an error state and retries', async () => {
    vi.mocked(apiClient.getGraph)
      .mockRejectedValueOnce(new ApiRequestError('boom', 500, 'HTTP_ERROR'))
      .mockResolvedValueOnce(graphResponse());

    render(<GraphExplorer />);

    expect(await screen.findByText("Couldn't load the graph")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getAllByText('Root').length).toBeGreaterThan(0));
    expect(apiClient.getGraph).toHaveBeenCalledTimes(2);
  });

  it('shows a deliberate empty state when the neighborhood has no nodes', async () => {
    vi.mocked(apiClient.getGraph).mockResolvedValue(graphResponse([]));

    render(<GraphExplorer />);

    expect(await screen.findByText('No nodes in this neighborhood')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Search symbols/ }),
    ).toBeInTheDocument();
  });

  it('defaults to the radial rings layout and switches layouts, re-positioning the graph', async () => {
    render(<GraphExplorer />);
    await waitFor(() => expect(reactFlowNodePositions.length).toBeGreaterThan(0));

    // Rings is the default and the root sits at the ring center.
    expect(screen.getByRole('button', { name: 'Rings layout' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const rootPos = () => reactFlowNodePositions.find((n) => n.id === ROOT.id)!.position;
    expect(rootPos()).toEqual({ x: 350, y: 250 });

    // Flow: root moves to the leftmost column (x shrinks toward the flow origin).
    fireEvent.click(screen.getByRole('button', { name: 'Flow layout' }));
    await waitFor(() => expect(rootPos().x).toBeLessThan(350));
    expect(screen.getByRole('button', { name: 'Flow layout' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const flowPos = rootPos();

    // Force: the physics simulation moves the root off its flow/ring spots.
    fireEvent.click(screen.getByRole('button', { name: 'Force layout' }));
    await waitFor(() => {
      const p = rootPos();
      expect(p.x).not.toBe(flowPos.x);
      expect(p.y).not.toBe(flowPos.y);
    });
    expect(screen.getByRole('button', { name: 'Force layout' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Switching back to rings restores the centered root.
    fireEvent.click(screen.getByRole('button', { name: 'Rings layout' }));
    await waitFor(() => expect(rootPos()).toEqual({ x: 350, y: 250 }));
  });

  it('persists dragged node positions on the canvas and offers a reset', async () => {
    render(<GraphExplorer />);
    await waitFor(() => expect(reactFlowNodePositions.length).toBeGreaterThan(0));

    const onDragStop = reactFlowProps.onNodeDragStop as (
      _: unknown,
      node: { id: string; position: { x: number; y: number } },
    ) => void;

    // Drag the neighbor to a new canvas position — like a free-form canvas.
    onDragStop({}, { id: NEIGHBOR.id, position: { x: 640, y: 480 } });
    await waitFor(() => {
      const p = reactFlowNodePositions.find((n) => n.id === NEIGHBOR.id)!;
      expect(p.position).toEqual({ x: 640, y: 480 });
    });
    // The re-render keeps the drag: no snap-back to the layout coordinates.
    const after = reactFlowNodePositions.find((n) => n.id === NEIGHBOR.id)!;
    expect(after.position).toEqual({ x: 640, y: 480 });

    // A reset action appears once the user has rearranged the canvas…
    fireEvent.click(screen.getByRole('button', { name: /Reset layout/ }));
    // …and restores the auto-layout position.
    await waitFor(() => {
      const p = reactFlowNodePositions.find((n) => n.id === NEIGHBOR.id)!;
      expect(p.position).not.toEqual({ x: 640, y: 480 });
    });
    expect(screen.queryByRole('button', { name: /Reset layout/ })).not.toBeInTheDocument();
  });

  it('clears user drags when the layout changes (a fresh arrangement wins)', async () => {
    render(<GraphExplorer />);
    await waitFor(() => expect(reactFlowNodePositions.length).toBeGreaterThan(0));

    const onDragStop = reactFlowProps.onNodeDragStop as (
      _: unknown,
      node: { id: string; position: { x: number; y: number } },
    ) => void;
    onDragStop({}, { id: ROOT.id, position: { x: 900, y: 900 } });
    await waitFor(() =>
      expect(reactFlowNodePositions.find((n) => n.id === ROOT.id)!.position).toEqual({ x: 900, y: 900 }),
    );

    // Switching layouts recomputes the arrangement and drops the override.
    fireEvent.click(screen.getByRole('button', { name: 'Flow layout' }));
    await waitFor(() => {
      const p = reactFlowNodePositions.find((n) => n.id === ROOT.id)!;
      expect(p.position).not.toEqual({ x: 900, y: 900 });
    });
  });

  it('enters a fullscreen canvas mode and exits via button or Esc', async () => {
    render(<GraphExplorer />);
    await waitFor(() => expect(reactFlowNodePositions.length).toBeGreaterThan(0));

    // Enter fullscreen — the page chrome is replaced by the canvas overlay.
    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/ }));
    const fullscreen = await screen.findByRole('region', {
      name: 'Graph Explorer fullscreen',
    });
    expect(within(fullscreen).getByText(/2 nodes · 1 relationships/)).toBeInTheDocument();
    // The page header is gone (no duplicate controls behind the overlay).
    expect(screen.queryByRole('heading', { name: 'Graph Explorer' })).not.toBeInTheDocument();

    // Controls stay live in fullscreen: switching layout re-positions the graph.
    const rootPos = () => reactFlowNodePositions.find((n) => n.id === ROOT.id)!.position;
    fireEvent.click(within(fullscreen).getByRole('button', { name: 'Flow layout' }));
    await waitFor(() => expect(rootPos().x).toBeLessThan(350));

    // Exit via the button restores the page chrome.
    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Graph Explorer fullscreen' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Graph Explorer' })).toBeInTheDocument();

    // Re-enter and exit with Escape.
    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/ }));
    await screen.findByRole('region', { name: 'Graph Explorer fullscreen' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Graph Explorer fullscreen' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('spotlights the hovered node neighborhood and dims everything else', async () => {
    const C: GraphNode = { id: 'fn:c.ts:C', type: 'Function', label: 'C', properties: {} };
    vi.mocked(apiClient.getGraph).mockResolvedValue(graphResponse([ROOT, NEIGHBOR, C]));
    render(<GraphExplorer />);
    await waitFor(() => expect(reactFlowNodePositions.length).toBeGreaterThan(0));

    const onEnter = reactFlowProps.onNodeMouseEnter as (e: unknown, node: { id: string }) => void;
    const onLeave = reactFlowProps.onNodeMouseLeave as (e: unknown, node: { id: string }) => void;
    const opacityOf = (id: string) =>
      (reactFlowNodePositions.find((n) => n.id === id)!.style as { opacity?: number } | undefined)
        ?.opacity;

    // Hover the root (connected to Neighbor): the isolated node C dims, the
    // connected neighborhood stays fully lit, and the edge brightens.
    onEnter({}, { id: ROOT.id });
    await waitFor(() => expect(opacityOf(C.id)).toBe(0.3));
    expect(opacityOf(ROOT.id)).toBeUndefined();
    expect(opacityOf(NEIGHBOR.id)).toBeUndefined();
    const litEdge = reactFlowEdges.find(
      (e) => e.source === ROOT.id && e.target === NEIGHBOR.id,
    )!;
    expect((litEdge.style as { opacity: number }).opacity).toBe(0.9);
    expect((litEdge.data as { dimmed?: boolean }).dimmed).toBe(false);

    // Leaving restores full opacity everywhere.
    onLeave({}, { id: ROOT.id });
    await waitFor(() => expect(opacityOf(C.id)).toBeUndefined());
  });

  it('simulates removing a node and marks everything that would break', async () => {
    render(<GraphExplorer />);
    await waitFor(() => expect(reactFlowNodePositions.length).toBeGreaterThan(0));

    // Enter what-if mode: the canvas waits for a target.
    fireEvent.click(screen.getByRole('button', { name: /What-if/ }));
    expect(screen.getByText(/Pick a node to simulate its removal/)).toBeInTheDocument();

    // Click Neighbor (the root CALLS it) → the root would break.
    fireEvent.click(within(screen.getByTestId('react-flow')).getByText('Neighbor'));
    await waitFor(() => {
      const root = reactFlowNodePositions.find((n) => n.id === ROOT.id)!;
      expect((root.data as { whatIfStatus: string }).whatIfStatus).toBe('affected');
    });
    const removed = reactFlowNodePositions.find((n) => n.id === NEIGHBOR.id)!;
    expect((removed.data as { whatIfStatus: string }).whatIfStatus).toBe('removed');
    expect((removed.style as { opacity: number }).opacity).toBe(0.45);
    // The banner reports the breakage and the dependency edge turns red.
    // (The banner text is split across elements, so assert on its textContent.)
    const statuses = screen.getAllByRole('status');
    const banner = statuses.map((s) => s.textContent).join(' ');
    expect(banner).toMatch(/1 (visible )?node would break/);
    expect(banner).toContain('Neighbor');
    const redEdge = reactFlowEdges.find(
      (e) => e.source === ROOT.id && e.target === NEIGHBOR.id,
    )!;
    expect((redEdge.style as { stroke: string }).stroke).toBe('#f43f5e');

    // Stopping the simulation restores normal styling.
    fireEvent.click(screen.getByRole('button', { name: /Stop simulation/ }));
    await waitFor(() => {
      const root = reactFlowNodePositions.find((n) => n.id === ROOT.id)!;
      expect((root.data as { whatIfStatus?: string }).whatIfStatus).toBeUndefined();
    });
  });

  it('traces the call path from an entry point and animates the hop edges', async () => {
    const C: GraphNode = { id: 'fn:c.ts:C', type: 'Function', label: 'C', properties: {} };
    const resp = graphResponse([ROOT, NEIGHBOR, C]);
    // The neighborhood must contain the whole spine for the trace to light it.
    resp.edges.push({ id: 'e2', source: NEIGHBOR.id, target: C.id, type: 'CALLS', properties: {} });
    vi.mocked(apiClient.getGraph).mockResolvedValue(resp);
    // Two-hop spine: Root → Neighbor → C.
    vi.mocked(apiClient.getTraversal).mockResolvedValue({
      root: { id: ROOT.id, type: ROOT.type, label: ROOT.label },
      depth: 2,
      nodes: [
        { ...ROOT, hops: 0 },
        { ...NEIGHBOR, hops: 1 },
        { ...C, hops: 2 },
      ],
      edges: [
        { id: 't1', source: ROOT.id, target: NEIGHBOR.id, type: 'CALLS', properties: {} },
        { id: 't2', source: NEIGHBOR.id, target: C.id, type: 'CALLS', properties: {} },
      ],
      paths: [{ nodes: [ROOT.id, NEIGHBOR.id, C.id], relTypes: ['CALLS', 'CALLS'] }],
    });
    render(<GraphExplorer />);
    await waitFor(() => expect(reactFlowNodePositions.length).toBeGreaterThan(0));

    // Enter trace mode: the canvas waits for an entry point.
    fireEvent.click(screen.getByRole('button', { name: /Trace/ }));
    expect(screen.getByText(/Pick an entry point/)).toBeInTheDocument();

    // Click the Root as the entry point → the real traversal is fetched.
    fireEvent.click(within(screen.getByTestId('react-flow')).getByText('Root'));
    await waitFor(() =>
      expect(apiClient.getTraversal).toHaveBeenCalledWith(
        ROOT.id,
        expect.objectContaining({ depth: 1, direction: 'out' }),
        'test-token',
      ),
    );

    // Step 1: the first hop (Root→Neighbor) glows as the active trace step;
    // the second hop edge is on the path but not yet lit.
    await waitFor(() => {
      const e1 = reactFlowEdges.find((e) => e.source === ROOT.id && e.target === NEIGHBOR.id)!;
      expect((e1.data as { traceStep?: boolean }).traceStep).toBe(true);
      expect((e1.data as { tracePath?: boolean }).tracePath).toBe(true);
    });
    const e2 = reactFlowEdges.find((e) => e.source === NEIGHBOR.id && e.target === C.id)!;
    expect((e2.data as { tracePath?: boolean }).tracePath).toBe(true);
    expect((e2.data as { traceStep?: boolean }).traceStep).toBe(false);
    // The banner reports the animation position (text split across elements).
    const statuses = screen.getAllByRole('status');
    const banner = statuses.map((s) => s.textContent).join(' ');
    expect(banner).toMatch(/Tracing Root/);
    expect(banner).toMatch(/step 1\/2/);

    // The animation clock advances the glow to the second hop.
    await waitFor(
      () => {
        const e2b = reactFlowEdges.find((e) => e.source === NEIGHBOR.id && e.target === C.id)!;
        expect((e2b.data as { traceStep?: boolean }).traceStep).toBe(true);
      },
      { timeout: 2000 },
    );
    const e1b = reactFlowEdges.find((e) => e.source === ROOT.id && e.target === NEIGHBOR.id)!;
    expect((e1b.data as { traceStep?: boolean }).traceStep).toBe(false);

    // Stopping the trace restores the canvas and clears the animation.
    fireEvent.click(screen.getByRole('button', { name: /Stop trace/ }));
    await waitFor(() => {
      const e1c = reactFlowEdges.find((e) => e.source === ROOT.id && e.target === NEIGHBOR.id)!;
      expect((e1c.data as { tracePath?: boolean }).tracePath).toBe(false);
      expect((e1c.data as { traceStep?: boolean }).traceStep).toBe(false);
    });
  });

  it('overlays trace path nodes/edges when the call targets are outside the neighborhood', async () => {
    // The neighborhood is just ROOT + NEIGHBOR, but the real call path reaches
    // a function the tree view never returns (function-level CALLS targets).
    const FAR: GraphNode = { id: 'fn:far.ts:FarHelper', type: 'Function', label: 'FarHelper', properties: {} };
    vi.mocked(apiClient.getGraph).mockResolvedValue(graphResponse([ROOT, NEIGHBOR]));
    vi.mocked(apiClient.getTraversal).mockResolvedValue({
      root: { id: ROOT.id, type: ROOT.type, label: ROOT.label },
      depth: 2,
      nodes: [
        { ...ROOT, hops: 0 },
        { ...NEIGHBOR, hops: 1 },
        { ...FAR, hops: 2 },
      ],
      edges: [
        { id: 't1', source: ROOT.id, target: NEIGHBOR.id, type: 'CALLS', properties: {} },
        { id: 't2', source: NEIGHBOR.id, target: FAR.id, type: 'CALLS', properties: {} },
      ],
      paths: [{ nodes: [ROOT.id, NEIGHBOR.id, FAR.id], relTypes: ['CALLS', 'CALLS'] }],
    });
    render(<GraphExplorer />);
    await waitFor(() => expect(reactFlowNodePositions.length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: /Trace/ }));
    fireEvent.click(within(screen.getByTestId('react-flow')).getByText('Root'));

    // The out-of-neighborhood call target is layered onto the canvas…
    await waitFor(() =>
      expect(reactFlowNodePositions.some((n) => n.id === FAR.id)).toBe(true),
    );
    // …and its CALLS edge is drawn with a unique (trace-prefixed) id.
    const farEdge = reactFlowEdges.find((e) => e.source === NEIGHBOR.id && e.target === FAR.id);
    expect(farEdge).toBeDefined();
    expect(farEdge!.id.startsWith('trace-')).toBe(true);
    expect((farEdge!.data as { traceStep?: boolean }).traceStep).toBe(false);
    expect((farEdge!.data as { tracePath?: boolean }).tracePath).toBe(true);
  });

  it('animates the shortest evidence path between two picked nodes (A → B)', async () => {
    const C: GraphNode = { id: 'fn:c.ts:C', type: 'Function', label: 'C', properties: {} };
    vi.mocked(apiClient.getGraph).mockResolvedValue(graphResponse([ROOT, NEIGHBOR, C]));
    // The traversal is rooted at A (outbound) — paths start at A and follow
    // the edge order, so the component slices out the one ending at B.
    vi.mocked(apiClient.getTraversal).mockResolvedValue({
      root: { id: ROOT.id, type: ROOT.type, label: ROOT.label },
      depth: 2,
      nodes: [
        { ...ROOT, hops: 0 },
        { ...NEIGHBOR, hops: 1 },
        { ...C, hops: 2 },
      ],
      edges: [
        { id: 'p1', source: ROOT.id, target: NEIGHBOR.id, type: 'CALLS', properties: {} },
        { id: 'p2', source: NEIGHBOR.id, target: C.id, type: 'CALLS', properties: {} },
      ],
      paths: [{ nodes: [ROOT.id, NEIGHBOR.id, C.id], relTypes: ['CALLS', 'CALLS'] }],
    });
    render(<GraphExplorer />);
    await waitFor(() => expect(screen.getAllByText('Root').length).toBeGreaterThan(0));

    // Enter path mode: the canvas waits for A.
    fireEvent.click(screen.getByRole('button', { name: /Path/ }));
    expect(screen.getByText(/Pick the start/)).toBeInTheDocument();

    // Click A (Root) → the banner waits for B.
    fireEvent.click(within(screen.getByTestId('react-flow')).getByText('Root'));
    expect(screen.getByText(/Now pick the end/)).toBeInTheDocument();

    // Click B (C) → the outbound traversal from A is fetched and the A→B
    // slice is animated hop by hop.
    fireEvent.click(within(screen.getByTestId('react-flow')).getByText('C'));
    await waitFor(() =>
      expect(apiClient.getTraversal).toHaveBeenCalledWith(
        ROOT.id,
        expect.objectContaining({ depth: 2, direction: 'out' }),
        'test-token',
      ),
    );

    // The spine lights up in order: hop 1 active, hop 2 on the path.
    await waitFor(() => {
      const e1 = reactFlowEdges.find((e) => e.source === ROOT.id && e.target === NEIGHBOR.id)!;
      expect((e1.data as { traceStep?: boolean }).traceStep).toBe(true);
      expect((e1.data as { tracePath?: boolean }).tracePath).toBe(true);
    });
    const e2 = reactFlowEdges.find((e) => e.source === NEIGHBOR.id && e.target === C.id)!;
    expect((e2.data as { tracePath?: boolean }).tracePath).toBe(true);
    expect((e2.data as { traceStep?: boolean }).traceStep).toBe(false);

    // The banner narrates the animated path (text split across elements).
    const statuses = screen.getAllByRole('status');
    const banner = statuses.map((s) => s.textContent).join(' ');
    expect(banner).toMatch(/Path from Root/);
    expect(banner).toMatch(/step 1\/2/);

    // The clock advances the glow to the final hop.
    await waitFor(
      () => {
        const e2b = reactFlowEdges.find((e) => e.source === NEIGHBOR.id && e.target === C.id)!;
        expect((e2b.data as { traceStep?: boolean }).traceStep).toBe(true);
      },
      { timeout: 2000 },
    );

    // Stopping restores the canvas.
    fireEvent.click(screen.getByRole('button', { name: /Stop path/ }));
    await waitFor(() => {
      const e1c = reactFlowEdges.find((e) => e.source === ROOT.id && e.target === NEIGHBOR.id)!;
      expect((e1c.data as { tracePath?: boolean }).tracePath).toBe(false);
    });
  });

  it('deep-links a whole multi-selection into the blast-radius tool', async () => {
    const A: GraphNode = {
      id: 'file:src/a.ts',
      type: 'File',
      label: 'a.ts',
      properties: { filePath: 'src/a.ts' },
    };
    const B: GraphNode = {
      id: 'file:src/b.ts',
      type: 'File',
      label: 'b.ts',
      properties: { filePath: 'src/b.ts' },
    };
    const NO_PATH: GraphNode = {
      id: 'cls:src/c.ts:C',
      type: 'Class',
      label: 'C',
      properties: {},
    };
    vi.mocked(apiClient.getGraph).mockResolvedValue(graphResponse([A, B, NO_PATH]));

    render(<GraphExplorer />);
    await waitFor(() => expect(screen.getAllByText('a.ts').length).toBeGreaterThan(0));

    const onSelectionChange = reactFlowProps.onSelectionChange as (sel: {
      nodes: Array<{ id: string }>;
    }) => void;

    // Select two files + one node without a path → only the two files link.
    onSelectionChange({ nodes: [{ id: A.id }, { id: B.id }, { id: NO_PATH.id }] });

    const link = await screen.findByRole('link', { name: /Analyze PR \(2\)/ });
    expect(link).toHaveAttribute(
      'href',
      `/intelligence?blast=${encodeURIComponent('src/a.ts,src/b.ts')}`,
    );

    // Re-emitting the SAME selection must not churn state (this is what would
    // drive React Flow into an update-depth loop with an unstable handler).
    onSelectionChange({ nodes: [{ id: A.id }, { id: B.id }, { id: NO_PATH.id }] });
    expect(screen.getByRole('link', { name: /Analyze PR \(2\)/ })).toBeInTheDocument();

    // A single selection collapses back to the per-node actions.
    onSelectionChange({ nodes: [{ id: A.id }] });
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Analyze PR \(/ })).not.toBeInTheDocument(),
    );
  });
});
