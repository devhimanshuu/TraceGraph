import { NotFoundException } from '@nestjs/common';
import { GithubImportJobService } from './github-import-job.service';
import { GithubImportService } from './github-import.service';

describe('GithubImportJobService', () => {
  let service: GithubImportJobService;
  let importer: { importRepo: jest.Mock };

  beforeEach(() => {
    importer = { importRepo: jest.fn() };
    service = new GithubImportJobService(
      importer as unknown as GithubImportService,
    );
  });

  it('starts an import job in the background and reports staged progress', async () => {
    // Let the test control pacing: the mock awaits a gate before each stage
    // so intermediate job states are observable from the outside.
    let releaseFetching: () => void = () => {};
    importer.importRepo.mockImplementation(
      async (_fullName: string, _token: string | undefined, onProgress?: (stage: string, label: string, detail?: string) => void) => {
        onProgress?.('fetching', 'Fetching repository files', 'Cloning a/b');
        await new Promise<void>((resolve) => {
          releaseFetching = resolve;
        });
        onProgress?.('parsing', 'Parsing source code', '3 files fetched');
        onProgress?.('persisting', 'Persisting to the graph', '10 nodes · 4 relationships');
        return {
          fullName: 'a/b',
          repositoryId: 'repo:a/b',
          nodesCreated: 10,
          relationshipsCreated: 4,
          files: 3,
          functions: 2,
          classes: 1,
          tests: 0,
          commits: 1,
          pullRequests: 0,
          issues: 0,
          durationMs: 500,
        };
      },
    );

    const start = service.startImport('a/b', 'gh-token');
    expect(start.jobId).toBeTruthy();
    expect(start.fullName).toBe('a/b');
    expect(importer.importRepo).toHaveBeenCalledWith(
      'a/b',
      'gh-token',
      expect.any(Function),
    );

    // The job starts out running at the first stage.
    const running = service.getJob(start.jobId);
    expect(running.status).toBe('running');
    expect(running.stage).toBe('fetching');

    // Release the gate; the pipeline advances and the job completes.
    releaseFetching();
    await new Promise((resolve) => setImmediate(resolve));
    const done = service.getJob(start.jobId);
    expect(done.status).toBe('done');
    expect(done.result?.nodesCreated).toBe(10);
    expect(done.stageLabel).toBe('Import complete');
  });

  it('records the failure reason on the job when the import rejects', async () => {
    importer.importRepo.mockRejectedValue(new Error('GitHub rate limited'));

    const start = service.startImport('a/b');
    await new Promise((resolve) => setImmediate(resolve));

    const job = service.getJob(start.jobId);
    expect(job.status).toBe('error');
    expect(job.error).toBe('GitHub rate limited');
  });

  it('throws 404 for an unknown job id', () => {
    expect(() => service.getJob('nope')).toThrow(NotFoundException);
  });
});
