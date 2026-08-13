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
});
