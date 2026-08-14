import type {
  DependencyTarget,
  GraphNode,
  HistoryCommit,
  HistoryIssue,
  HistoryPullRequest,
  NodeRelationships,
  RelationshipSummary,
  TestCoverage,
  TraversalResult,
} from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

export interface NodeService {
  getNode(id: string, token?: string | null): Promise<GraphNode>;
  getRelationshipSummary(id: string, token?: string | null): Promise<RelationshipSummary>;
  getRelationships(id: string, limit?: number, token?: string | null): Promise<NodeRelationships>;
  getDependencies(id: string, limit?: number, token?: string | null): Promise<DependencyTarget[]>;
  getDependents(id: string, limit?: number, token?: string | null): Promise<DependencyTarget[]>;
  getCallers(id: string, limit?: number, token?: string | null): Promise<DependencyTarget[]>;
  getCallees(id: string, limit?: number, token?: string | null): Promise<DependencyTarget[]>;
  getTests(id: string, limit?: number, token?: string | null): Promise<TestCoverage[]>;
  getCommits(id: string, limit?: number, token?: string | null): Promise<HistoryCommit[]>;
  getPullRequests(id: string, limit?: number, token?: string | null): Promise<HistoryPullRequest[]>;
  getIssues(id: string, limit?: number, token?: string | null): Promise<HistoryIssue[]>;
  getTraversal(
    id: string,
    options?: { depth?: number; direction?: 'out' | 'in'; limit?: number; types?: string[] },
    token?: string | null,
  ): Promise<TraversalResult>;
}

export const nodeService: NodeService = {
  getNode: (id, token) => apiClient.getNode(id, token),
  getRelationshipSummary: (id, token) => apiClient.getRelationshipSummary(id, token),
  getRelationships: (id, limit = 100, token) => apiClient.getRelationships(id, limit, token),
  getDependencies: (id, limit = 100, token) => apiClient.getDependencies(id, limit, token),
  getDependents: (id, limit = 100, token) => apiClient.getDependents(id, limit, token),
  getCallers: (id, limit = 100, token) => apiClient.getCallers(id, limit, token),
  getCallees: (id, limit = 100, token) => apiClient.getCallees(id, limit, token),
  getTests: (id, limit = 100, token) => apiClient.getTests(id, limit, token),
  getCommits: (id, limit = 50, token) => apiClient.getCommits(id, limit, token),
  getPullRequests: (id, limit = 50, token) => apiClient.getPullRequests(id, limit, token),
  getIssues: (id, limit = 50, token) => apiClient.getIssues(id, limit, token),
  getTraversal: (id, options, token) => apiClient.getTraversal(id, options, token),
};
