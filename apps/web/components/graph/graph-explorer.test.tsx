import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GraphNode, GraphResponse } from '@tracegraph/shared';
import { GraphExplorer } from './graph-explorer';

// ── React Flow mock: renders children (so custom nodes render real labels) and
// exposes the props for interaction tests (onNodeClick).
const reactFlowProps: Record<string, unknown> = {};
vi.mock('@xyflow/react', () => {
  const rf = ({
    children,
    nodes = [],
    nodeTypes = {},
    onNodeClick,
    ...props
  }: {
    children: React.ReactNode;
    nodes?: Array<{ id: string; type: string; data: unknown; selected?: boolean }>;
    nodeTypes?: Record<string, (p: { data: unknown; selected?: boolean }) => React.ReactNode>;
    onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
  }) => {
    Object.assign(reactFlowProps, props);
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
  vi.mocked(apiClient.getGraph).mockResolvedValue(graphResponse());
  vi.mocked(apiClient.getNode).mockResolvedValue(ROOT);
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
