import { NotFoundException } from '@nestjs/common';
import { GraphRepository } from '../graph/graph.repository';
import { GraphService } from '../graph/graph.service';
import { HistoryService } from './history.service';

describe('HistoryService', () => {
  const graphService = {
    getNode: jest.fn(),
  } as unknown as GraphService;
  const graphRepository = {
    findCommits: jest.fn(),
    findPullRequests: jest.fn(),
    findIssues: jest.fn(),
  } as unknown as GraphRepository;
  const service = new HistoryService(graphRepository, graphService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getCommits returns commits for an existing entity', async () => {
    (graphService.getNode as jest.Mock).mockResolvedValue({
      id: 'file:x',
      type: 'File',
      label: 'x',
    });
    (graphRepository.findCommits as jest.Mock).mockResolvedValue([
      {
        sha: '8f21ac7',
        message: 'Add retry handling',
        timestamp: 't',
        branch: 'main',
        author: null,
      },
    ]);

    const commits = await service.getCommits('file:x', 25);
    expect(graphRepository.findCommits).toHaveBeenCalledWith('file:x', 25);
    expect(commits[0].sha).toBe('8f21ac7');
  });

  it('throws 404 for an unknown entity without querying history', async () => {
    (graphService.getNode as jest.Mock).mockRejectedValue(new NotFoundException('missing'));
    await expect(service.getPullRequests('nope', 25)).rejects.toBeInstanceOf(NotFoundException);
    expect(graphRepository.findPullRequests).not.toHaveBeenCalled();
  });

  it('getIssues delegates with the limit', async () => {
    (graphService.getNode as jest.Mock).mockResolvedValue({
      id: 'file:x',
      type: 'File',
      label: 'x',
    });
    (graphRepository.findIssues as jest.Mock).mockResolvedValue([]);
    await service.getIssues('file:x', 10);
    expect(graphRepository.findIssues).toHaveBeenCalledWith('file:x', 10);
  });
});
