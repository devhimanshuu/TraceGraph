import { BadRequestException } from '@nestjs/common';
import { GithubApiService } from './github-api.service';
import { GithubImportService } from './github-import.service';

jest.mock('./repo-extractor', () => ({
  extractRepo: jest.fn(),
  collectRepoFiles: jest.fn(),
}));

import { collectRepoFiles, extractRepo } from './repo-extractor';
import type { DatabaseService } from '../database/database.service';
import type { GraphRepository } from '../graph/graph.repository';

const FILES = [
  {
    path: 'src/payment.service.ts',
    source:
      'export class BaseService {}\nexport class PaymentService extends BaseService {\n  processPayment(amount: number): string {\n    return \'ok\';\n  }\n}',
    linesOfCode: 5,
    sizeBytes: 100,
  },
  {
    path: 'src/checkout.ts',
    source:
      "import { PaymentService } from './payment.service';\nexport function checkout(): string {\n  return PaymentService.processPayment(10);\n}",
    linesOfCode: 4,
    sizeBytes: 100,
  },
  {
    path: 'src/checkout.spec.ts',
    source:
      "import { checkout } from './checkout';\ndescribe('checkout', () => {\n  it('returns ok', () => {\n    expect(checkout()).toBe('ok');\n  });\n});",
    linesOfCode: 5,
    sizeBytes: 100,
  },
];

describe('GithubImportService', () => {
  let service: GithubImportService;
  let api: { [K in keyof GithubApiService]: jest.Mock };
  let db: { executeWrite: jest.Mock };
  let graph: { countNodesByLabel: jest.Mock; countTraceGraphRelationships: jest.Mock };
  let cleanup: jest.Mock;
  let runCalls: Array<{ name: string; query: string; params?: unknown }>;
  let currentRunName: string;

  beforeEach(() => {
    api = {
      getRepoMetadata: jest.fn().mockResolvedValue({
        name: 'hello-world',
        default_branch: 'main',
        description: 'A demo repo',
        language: 'TypeScript',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }),
      downloadTarball: jest.fn().mockResolvedValue(Buffer.alloc(0)),
      listCommits: jest
        .fn()
        .mockResolvedValue([
          {
            sha: 'abc123',
            commit: { message: 'feat: checkout', author: { name: 'Dev One', date: '2025-01-01T00:00:00Z' } },
            author: { login: 'dev1' },
          },
        ]),
      getCommit: jest
        .fn()
        .mockResolvedValue({ files: [{ filename: 'src/checkout.ts' }] }),
      listPulls: jest.fn().mockResolvedValue([
        {
          number: 7,
          title: 'Add checkout',
          state: 'closed',
          merged: true,
          merged_at: '2025-01-02T00:00:00Z',
          merge_commit_sha: 'abc123',
          head: { sha: 'abc123' },
        },
      ]),
      listIssues: jest.fn().mockResolvedValue([{ number: 8, title: 'bug', state: 'open' }]),
    } as unknown as { [K in keyof GithubApiService]: jest.Mock };

    // Capture every Cypher invocation with its name + params by invoking the
    // transaction callback with a fake tx (mirrors DatabaseService's contract).
    runCalls = [];
    const fakeTx = {
      run: jest.fn((query: string, params?: unknown) => {
        runCalls.push({ name: currentRunName, query, params });
      }),
    };
    db = {
      executeWrite: jest.fn().mockImplementation(async (fn, opts) => {
        currentRunName = (opts as { name?: string } | undefined)?.name ?? '';
        await fn(fakeTx);
      }),
    };
    graph = {
      countNodesByLabel: jest
        .fn()
        .mockResolvedValueOnce({
          Repository: 0, Directory: 0, File: 0, Class: 0, Function: 0,
          Test: 0, Commit: 0, PullRequest: 0, Issue: 0, Developer: 0,
        })
        .mockResolvedValueOnce({
          Repository: 1, Directory: 1, File: 3, Class: 2, Function: 1,
          Test: 1, Commit: 1, PullRequest: 1, Issue: 1, Developer: 1,
        }),
      countTraceGraphRelationships: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(9),
    };

    cleanup = jest.fn().mockResolvedValue(undefined);
    (extractRepo as jest.Mock).mockResolvedValue({
      root: '/tmp/fake-root',
      dir: '/tmp/fake-dir',
      cleanup,
    });
    (collectRepoFiles as jest.Mock).mockResolvedValue(FILES);

    service = new GithubImportService(
      api as unknown as GithubApiService,
      db as unknown as DatabaseService,
      graph as unknown as GraphRepository,
    );
  });

  it('rejects malformed repository names', async () => {
    await expect(service.importRepo('not-a-full-name')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('imports a repo end-to-end and reports honest counts', async () => {
    const result = await service.importRepo('octocat/hello-world', 'gh-token');

    expect(result.fullName).toBe('octocat/hello-world');
    expect(result.repositoryId).toBe('repo:octocat/hello-world');
    expect(result.files).toBe(3);
    expect(result.classes).toBe(2);
    expect(result.functions).toBe(1);
    expect(result.tests).toBe(1);
    expect(result.commits).toBe(1);
    expect(result.pullRequests).toBe(1);
    expect(result.issues).toBe(1);
    expect(result.nodesCreated).toBe(13);
    expect(result.relationshipsCreated).toBe(9);

    // Temp extraction dir is cleaned up.
    expect(cleanup).toHaveBeenCalledTimes(1);
    // The GitHub token flows into API calls.
    expect(api.getRepoMetadata).toHaveBeenCalledWith('octocat/hello-world', 'gh-token');
  });

  it('writes CALLS edges resolved through imports to the right function ids', async () => {
    await service.importRepo('octocat/hello-world', '');

    const rows = rowsFor('import-edges-calls-function-function');
    expect(rows).toContainEqual({
      from: 'fn:src/checkout.ts:checkout',
      to: 'fn:src/payment.service.ts:PaymentService.processPayment',
    });
  });

  it('writes EXTENDS and TESTS edges', async () => {
    await service.importRepo('octocat/hello-world', '');

    const extendsRows = rowsFor('import-edges-extends-class-class');
    expect(extendsRows).toContainEqual({
      from: 'fn:src/payment.service.ts:PaymentService',
      to: 'fn:src/payment.service.ts:BaseService',
    });

    const testsRows = rowsFor('import-edges-tests-test-function');
    expect(testsRows).toContainEqual({
      from: 'test:src/checkout.spec.ts',
      to: 'fn:src/checkout.ts:checkout',
    });
  });

  it('writes MODIFIES and AUTHORED_BY history edges', async () => {
    await service.importRepo('octocat/hello-world', '');

    const modifiesRows = rowsFor('import-edges-modifies-commit-file');
    expect(modifiesRows).toContainEqual({
      from: 'commit:abc123',
      to: 'file:src/checkout.ts',
    });

    const authoredRows = rowsFor('import-edges-authored_by-commit-developer');
    expect(authoredRows).toContainEqual({ from: 'commit:abc123', to: 'dev:dev1' });
  });

  function rowsFor(name: string): Array<{ from: string; to: string }> {
    const call = runCalls.find((c) => c.name === name);
    expect(call).toBeDefined();
    const params = call?.params as {
      rows?: Array<{ from: string; to: string; props?: unknown }>;
    };
    return (params?.rows ?? []).map(({ from, to }) => ({ from, to }));
  }
});
