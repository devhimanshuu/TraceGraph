import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { nodeService } from './node.service';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getNode: vi.fn(),
    getRelationshipSummary: vi.fn(),
    getRelationships: vi.fn(),
    getDependencies: vi.fn(),
    getDependents: vi.fn(),
    getCallers: vi.fn(),
    getCallees: vi.fn(),
    getTests: vi.fn(),
    getCommits: vi.fn(),
    getPullRequests: vi.fn(),
    getIssues: vi.fn(),
    getTraversal: vi.fn(),
  },
}));

describe('nodeService', () => {
  it('delegates getNode to apiClient.getNode', async () => {
    vi.mocked(apiClient.getNode).mockResolvedValue({
      id: 'node-1',
      type: 'Class',
      label: 'PaymentService',
      properties: {},
    });

    const result = await nodeService.getNode('node-1', 'token-123');
    expect(apiClient.getNode).toHaveBeenCalledWith('node-1', 'token-123');
    expect(result.label).toBe('PaymentService');
  });

  it('delegates getDependencies to apiClient.getDependencies with limit', async () => {
    vi.mocked(apiClient.getDependencies).mockResolvedValue([]);
    await nodeService.getDependencies('node-1', 50, 'token-123');
    expect(apiClient.getDependencies).toHaveBeenCalledWith('node-1', 50, 'token-123');
  });

  it('delegates getTraversal with options and token', async () => {
    vi.mocked(apiClient.getTraversal).mockResolvedValue({
      root: { id: 'node-1', type: 'Class', label: 'PaymentService' },
      depth: 3,
      nodes: [],
      edges: [],
      paths: [],
    });

    await nodeService.getTraversal('node-1', { depth: 3, direction: 'in' }, 'token-123');
    expect(apiClient.getTraversal).toHaveBeenCalledWith(
      'node-1',
      { depth: 3, direction: 'in' },
      'token-123',
    );
  });
});
