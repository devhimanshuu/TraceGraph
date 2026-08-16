import { NotFoundException } from '@nestjs/common';
import { GraphRepository } from '../graph/graph.repository';
import { RepositoryService } from './repository.service';

describe('RepositoryService', () => {
  const repoNode = {
    id: 'repo:commerce-platform',
    type: 'Repository' as const,
    label: 'commerce-platform',
    properties: {
      id: 'repo:commerce-platform',
      name: 'commerce-platform',
      fullName: 'acme/commerce-platform',
      description: 'A modular commerce backend',
      language: 'TypeScript',
      defaultBranch: 'main',
    },
  };

  const graphRepository = {
    findDefaultRepository: jest.fn(),
    countNodesByLabel: jest.fn(),
    countTraceGraphRelationships: jest.fn(),
    findRepositoryActivity: jest.fn(),
    findRepositoryComponents: jest.fn(),
    findAllRepositories: jest.fn(),
    setActiveRepository: jest.fn(),
  } as unknown as GraphRepository;
  const service = new RepositoryService(graphRepository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('composes the repository node with label-scoped statistics', async () => {
    (graphRepository.findDefaultRepository as jest.Mock).mockResolvedValue(repoNode);
    (graphRepository.countNodesByLabel as jest.Mock).mockResolvedValue({
      Directory: 11,
      File: 37,
      Function: 64,
      Class: 21,
      Test: 19,
      Commit: 24,
      PullRequest: 11,
      Issue: 9,
      Developer: 5,
    });
    (graphRepository.countTraceGraphRelationships as jest.Mock).mockResolvedValue(348);

    const overview = await service.getOverview();
    expect(overview).toMatchObject({
      id: 'repo:commerce-platform',
      name: 'commerce-platform',
      language: 'TypeScript',
      relationshipCount: 348,
      stats: {
        directories: 11,
        files: 37,
        functions: 64,
        classes: 21,
        tests: 19,
        commits: 24,
        pullRequests: 11,
        issues: 9,
        developers: 5,
      },
    });
  });

  it('throws NotFoundException when no repository is seeded', async () => {
    (graphRepository.findDefaultRepository as jest.Mock).mockResolvedValue(null);
    await expect(service.getOverview()).rejects.toBeInstanceOf(NotFoundException);
    expect(graphRepository.countNodesByLabel).not.toHaveBeenCalled();
  });

  describe('getActivity', () => {
    it('returns repo-wide commits, pull requests and issues', async () => {
      (graphRepository.findDefaultRepository as jest.Mock).mockResolvedValue(repoNode);
      const activity = {
        commits: [{ sha: '8f21ac7', message: 'x', timestamp: '2025-03-05T00:00:00.000Z', branch: 'main', author: null }],
        pullRequests: [{ number: 421, title: 'Add payment retry handling', status: 'merged', createdAt: '2025-03-05T00:00:00.000Z' }],
        issues: [{ number: 912, title: 'Checkout occasionally times out', status: 'closed', createdAt: '2025-02-20T00:00:00.000Z' }],
      };
      (graphRepository.findRepositoryActivity as jest.Mock).mockResolvedValue(activity);

      const result = await service.getActivity(10);
      expect(result).toEqual(activity);
      expect(graphRepository.findRepositoryActivity).toHaveBeenCalledWith(
        'repo:commerce-platform',
        10,
        undefined,
      );
    });

    it('passes the since cutoff through for time-filtered activity', async () => {
      (graphRepository.findDefaultRepository as jest.Mock).mockResolvedValue(repoNode);
      (graphRepository.findRepositoryActivity as jest.Mock).mockResolvedValue({
        commits: [],
        pullRequests: [],
        issues: [],
      });

      await service.getActivity(10, '2025-02-01T00:00:00.000Z');
      expect(graphRepository.findRepositoryActivity).toHaveBeenCalledWith(
        'repo:commerce-platform',
        10,
        '2025-02-01T00:00:00.000Z',
      );
    });

    it('404s when no repository is seeded', async () => {
      (graphRepository.findDefaultRepository as jest.Mock).mockResolvedValue(null);
      await expect(service.getActivity()).rejects.toBeInstanceOf(NotFoundException);
      expect(graphRepository.findRepositoryActivity).not.toHaveBeenCalled();
    });
  });

  describe('getComponents', () => {
    it('returns core components ranked by dependents', async () => {
      (graphRepository.findDefaultRepository as jest.Mock).mockResolvedValue(repoNode);
      const components = [
        { id: 'class:payment.service.ts:PaymentService', type: 'Class', label: 'PaymentService', dependents: 6 },
      ];
      (graphRepository.findRepositoryComponents as jest.Mock).mockResolvedValue(components);

      const result = await service.getComponents(8);
      expect(result).toEqual(components);
      expect(graphRepository.findRepositoryComponents).toHaveBeenCalledWith(
        'repo:commerce-platform',
        8,
      );
    });
  });

  describe('listRepositories', () => {
    const repoNodes = [
      repoNode,
      {
        id: 'repo:budget-buddy',
        type: 'Repository' as const,
        label: 'budget-buddy',
        properties: {
          id: 'repo:budget-buddy',
          name: 'budget-buddy',
          fullName: 'acme/budget-buddy',
          description: 'A personal budget tracker',
          language: 'TypeScript',
          defaultBranch: 'main',
          active: true,
        },
      },
    ];

    it('maps repo nodes to imported-repository summaries', async () => {
      (graphRepository.findAllRepositories as jest.Mock).mockResolvedValue(repoNodes);

      const result = await service.listRepositories();
      expect(result).toEqual([
        {
          id: 'repo:commerce-platform',
          name: 'commerce-platform',
          fullName: 'acme/commerce-platform',
          description: 'A modular commerce backend',
          language: 'TypeScript',
          active: false,
        },
        {
          id: 'repo:budget-buddy',
          name: 'budget-buddy',
          fullName: 'acme/budget-buddy',
          description: 'A personal budget tracker',
          language: 'TypeScript',
          active: true,
        },
      ]);
    });
  });

  describe('setActiveRepository', () => {
    const repos = [
      repoNode,
      {
        id: 'repo:budget-buddy',
        type: 'Repository' as const,
        label: 'budget-buddy',
        properties: {
          id: 'repo:budget-buddy',
          name: 'budget-buddy',
          fullName: 'acme/budget-buddy',
          active: false,
        },
      },
    ];

    it('marks the target repository active and returns it', async () => {
      (graphRepository.findAllRepositories as jest.Mock).mockResolvedValue(repos);
      (graphRepository.setActiveRepository as jest.Mock).mockResolvedValue(undefined);

      const result = await service.setActiveRepository('repo:budget-buddy');
      expect(graphRepository.setActiveRepository).toHaveBeenCalledWith('repo:budget-buddy');
      expect(result).toMatchObject({ id: 'repo:budget-buddy', active: false });
    });

    it('404s for a repository that is not in the graph', async () => {
      (graphRepository.findAllRepositories as jest.Mock).mockResolvedValue(repos);
      await expect(service.setActiveRepository('repo:unknown')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(graphRepository.setActiveRepository).not.toHaveBeenCalled();
    });
  });
});
