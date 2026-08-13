/**
 * commerce-platform — repository, directory tree, and file inventory.
 *
 * All data is fictional demo data (Phase 4 §4). Counts are deterministic so
 * `db:verify` can compare the live graph against this definition.
 */
import type { SeedNode, SeedRel } from '../types';
import { dirId, fileId, repoId } from '../ids';

export const REPOSITORY_NAME = 'commerce-platform';
export const REPOSITORY_ID = repoId(REPOSITORY_NAME);

/** Directory paths (also used as file-path prefixes). */
export const DIRECTORIES = [
  'apps',
  'apps/api',
  'apps/api/controllers',
  'apps/api/services',
  'apps/api/repositories',
  'apps/web',
  'packages',
  'packages/database',
  'packages/shared',
  'lib',
  'tests',
] as const;

export interface FileSpec {
  path: string;
  linesOfCode: number;
  category: string;
  /** Index of the parent directory in DIRECTORIES. */
  parentDir: number;
}

/** File paths, LOC, and category — deliberately realistic, not "File1/File2". */
export const FILES: FileSpec[] = [
  // apps/api/controllers
  {
    path: 'apps/api/controllers/auth.controller.ts',
    linesOfCode: 84,
    category: 'controller',
    parentDir: 2,
  },
  {
    path: 'apps/api/controllers/checkout.controller.ts',
    linesOfCode: 112,
    category: 'controller',
    parentDir: 2,
  },
  {
    path: 'apps/api/controllers/notification.controller.ts',
    linesOfCode: 74,
    category: 'controller',
    parentDir: 2,
  },
  {
    path: 'apps/api/controllers/order.controller.ts',
    linesOfCode: 96,
    category: 'controller',
    parentDir: 2,
  },
  {
    path: 'apps/api/controllers/payment.controller.ts',
    linesOfCode: 118,
    category: 'controller',
    parentDir: 2,
  },
  {
    path: 'apps/api/controllers/user.controller.ts',
    linesOfCode: 88,
    category: 'controller',
    parentDir: 2,
  },
  // apps/api/services
  {
    path: 'apps/api/services/auth.service.ts',
    linesOfCode: 156,
    category: 'service',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/checkout.service.ts',
    linesOfCode: 198,
    category: 'service',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/notification.service.ts',
    linesOfCode: 132,
    category: 'service',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/order.service.ts',
    linesOfCode: 176,
    category: 'service',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/payment.service.ts',
    linesOfCode: 224,
    category: 'service',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/refund.service.ts',
    linesOfCode: 148,
    category: 'service',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/user.service.ts',
    linesOfCode: 142,
    category: 'service',
    parentDir: 3,
  },
  // apps/api/services — unit tests (colocated)
  {
    path: 'apps/api/services/auth.service.spec.ts',
    linesOfCode: 96,
    category: 'test',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/checkout.service.spec.ts',
    linesOfCode: 128,
    category: 'test',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/notification.service.spec.ts',
    linesOfCode: 84,
    category: 'test',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/order.service.spec.ts',
    linesOfCode: 112,
    category: 'test',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/payment.service.spec.ts',
    linesOfCode: 138,
    category: 'test',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/refund.service.spec.ts',
    linesOfCode: 92,
    category: 'test',
    parentDir: 3,
  },
  {
    path: 'apps/api/services/user.service.spec.ts',
    linesOfCode: 88,
    category: 'test',
    parentDir: 3,
  },
  // apps/api/repositories
  {
    path: 'apps/api/repositories/order.repository.ts',
    linesOfCode: 98,
    category: 'repository',
    parentDir: 4,
  },
  {
    path: 'apps/api/repositories/payment.repository.ts',
    linesOfCode: 118,
    category: 'repository',
    parentDir: 4,
  },
  {
    path: 'apps/api/repositories/user.repository.ts',
    linesOfCode: 92,
    category: 'repository',
    parentDir: 4,
  },
  // apps/web
  { path: 'apps/web/checkout.page.tsx', linesOfCode: 132, category: 'page', parentDir: 5 },
  { path: 'apps/web/order.page.tsx', linesOfCode: 108, category: 'page', parentDir: 5 },
  { path: 'apps/web/payment.page.tsx', linesOfCode: 96, category: 'page', parentDir: 5 },
  // packages/database
  {
    path: 'packages/database/database.service.ts',
    linesOfCode: 186,
    category: 'service',
    parentDir: 7,
  },
  { path: 'packages/database/migrations.ts', linesOfCode: 142, category: 'utility', parentDir: 7 },
  // packages/shared
  { path: 'packages/shared/types.ts', linesOfCode: 210, category: 'model', parentDir: 8 },
  { path: 'packages/shared/errors.ts', linesOfCode: 86, category: 'model', parentDir: 8 },
  // lib
  { path: 'lib/stripe.client.ts', linesOfCode: 164, category: 'service', parentDir: 9 },
  { path: 'lib/token.service.ts', linesOfCode: 108, category: 'service', parentDir: 9 },
  { path: 'lib/events.ts', linesOfCode: 94, category: 'utility', parentDir: 9 },
  { path: 'lib/logger.ts', linesOfCode: 66, category: 'utility', parentDir: 9 },
  { path: 'lib/http.ts', linesOfCode: 118, category: 'utility', parentDir: 9 },
  // tests — integration tests
  { path: 'tests/checkout.integration.test.ts', linesOfCode: 142, category: 'test', parentDir: 10 },
  { path: 'tests/payment.integration.test.ts', linesOfCode: 128, category: 'test', parentDir: 10 },
];

const nameOf = (path: string): string => path.split('/').pop() ?? path;
const extOf = (path: string): string => (path.endsWith('.tsx') ? 'tsx' : 'ts');

export const fileNodes = (): SeedNode[] =>
  FILES.map((f) => ({
    label: 'File' as const,
    props: {
      id: fileId(f.path),
      name: nameOf(f.path),
      path: f.path,
      extension: extOf(f.path),
      language: 'TypeScript',
      linesOfCode: f.linesOfCode,
      category: f.category,
    },
  }));

export const directoryNodes = (): SeedNode[] =>
  DIRECTORIES.map((path) => ({
    label: 'Directory' as const,
    props: { id: dirId(path), name: path.split('/').pop() ?? path, path },
  }));

export const repositoryNodes = (): SeedNode[] => [
  {
    label: 'Repository' as const,
    props: {
      id: REPOSITORY_ID,
      name: REPOSITORY_NAME,
      fullName: 'acme/commerce-platform',
      description:
        'A modular commerce backend supporting authentication, user management, orders, checkout, payments, refunds, and notifications.',
      language: 'TypeScript',
      defaultBranch: 'main',
      createdAt: '2025-01-14T09:00:00.000Z',
      updatedAt: '2025-06-02T16:40:00.000Z',
    },
  },
];

/** Containment: Repository CONTAINS Directory CONTAINS File. */
export const containmentRels = (): SeedRel[] => {
  const rels: SeedRel[] = [];
  for (const path of DIRECTORIES) {
    rels.push({
      type: 'CONTAINS',
      fromLabel: 'Repository',
      toLabel: 'Directory',
      from: REPOSITORY_ID,
      to: dirId(path),
    });
  }
  for (const f of FILES) {
    rels.push({
      type: 'CONTAINS',
      fromLabel: 'Directory',
      toLabel: 'File',
      from: dirId(DIRECTORIES[f.parentDir]),
      to: fileId(f.path),
    });
  }
  return rels;
};

/** Import graph: `(:File)-[:IMPORTS {line}]->(:File)` — line = import statement line. */
export const importRels = (): SeedRel[] => {
  const rel = (from: string, to: string, line: number): SeedRel => ({
    type: 'IMPORTS',
    fromLabel: 'File',
    toLabel: 'File',
    from: fileId(from),
    to: fileId(to),
    props: { line },
  });
  return [
    rel('apps/api/controllers/auth.controller.ts', 'apps/api/services/auth.service.ts', 4),
    rel('apps/api/controllers/auth.controller.ts', 'packages/shared/types.ts', 5),
    rel('apps/api/controllers/checkout.controller.ts', 'apps/api/services/checkout.service.ts', 5),
    rel('apps/api/controllers/checkout.controller.ts', 'apps/api/services/order.service.ts', 6),
    rel('apps/api/controllers/checkout.controller.ts', 'apps/api/services/payment.service.ts', 7),
    rel('apps/api/controllers/checkout.controller.ts', 'packages/shared/types.ts', 8),
    rel(
      'apps/api/controllers/notification.controller.ts',
      'apps/api/services/notification.service.ts',
      4,
    ),
    rel('apps/api/controllers/notification.controller.ts', 'packages/shared/types.ts', 5),
    rel('apps/api/controllers/order.controller.ts', 'apps/api/services/order.service.ts', 4),
    rel('apps/api/controllers/order.controller.ts', 'packages/shared/types.ts', 5),
    rel('apps/api/controllers/payment.controller.ts', 'apps/api/services/payment.service.ts', 5),
    rel('apps/api/controllers/payment.controller.ts', 'lib/stripe.client.ts', 6),
    rel('apps/api/controllers/payment.controller.ts', 'packages/shared/types.ts', 7),
    rel('apps/api/controllers/user.controller.ts', 'apps/api/services/user.service.ts', 4),
    rel('apps/api/controllers/user.controller.ts', 'packages/shared/types.ts', 5),
    rel('apps/api/services/auth.service.ts', 'apps/api/repositories/user.repository.ts', 5),
    rel('apps/api/services/auth.service.ts', 'lib/token.service.ts', 6),
    rel('apps/api/services/auth.service.ts', 'packages/shared/errors.ts', 7),
    rel('apps/api/services/checkout.service.ts', 'apps/api/services/order.service.ts', 6),
    rel('apps/api/services/checkout.service.ts', 'apps/api/services/payment.service.ts', 7),
    rel('apps/api/services/checkout.service.ts', 'apps/api/services/notification.service.ts', 8),
    rel('apps/api/services/checkout.service.ts', 'packages/shared/errors.ts', 9),
    rel('apps/api/services/checkout.service.ts', 'packages/shared/types.ts', 10),
    rel('apps/api/services/notification.service.ts', 'lib/events.ts', 5),
    rel('apps/api/services/notification.service.ts', 'lib/logger.ts', 6),
    rel('apps/api/services/order.service.ts', 'apps/api/repositories/order.repository.ts', 5),
    rel('apps/api/services/order.service.ts', 'packages/shared/errors.ts', 6),
    rel('apps/api/services/order.service.ts', 'packages/shared/types.ts', 7),
    rel('apps/api/services/payment.service.ts', 'apps/api/repositories/payment.repository.ts', 6),
    rel('apps/api/services/payment.service.ts', 'lib/stripe.client.ts', 7),
    rel('apps/api/services/payment.service.ts', 'apps/api/services/notification.service.ts', 8),
    rel('apps/api/services/payment.service.ts', 'packages/shared/errors.ts', 9),
    rel('apps/api/services/payment.service.ts', 'packages/shared/types.ts', 10),
    rel('apps/api/services/refund.service.ts', 'apps/api/repositories/payment.repository.ts', 5),
    rel('apps/api/services/refund.service.ts', 'lib/stripe.client.ts', 6),
    rel('apps/api/services/refund.service.ts', 'packages/shared/errors.ts', 7),
    rel('apps/api/services/user.service.ts', 'apps/api/repositories/user.repository.ts', 5),
    rel('apps/api/services/user.service.ts', 'packages/shared/errors.ts', 6),
    rel('apps/api/repositories/order.repository.ts', 'packages/database/database.service.ts', 6),
    rel('apps/api/repositories/order.repository.ts', 'packages/shared/types.ts', 7),
    rel('apps/api/repositories/payment.repository.ts', 'packages/database/database.service.ts', 6),
    rel('apps/api/repositories/payment.repository.ts', 'packages/shared/types.ts', 7),
    rel('apps/api/repositories/user.repository.ts', 'packages/database/database.service.ts', 6),
    rel('apps/api/repositories/user.repository.ts', 'packages/shared/types.ts', 7),
    rel('lib/stripe.client.ts', 'lib/http.ts', 6),
    rel('lib/stripe.client.ts', 'packages/shared/errors.ts', 7),
    rel('lib/stripe.client.ts', 'lib/logger.ts', 8),
    rel('lib/token.service.ts', 'packages/shared/errors.ts', 5),
    rel('lib/token.service.ts', 'lib/logger.ts', 6),
    rel('lib/events.ts', 'lib/logger.ts', 4),
    rel('lib/http.ts', 'packages/shared/errors.ts', 5),
    rel('lib/http.ts', 'lib/logger.ts', 6),
    rel('packages/database/database.service.ts', 'packages/shared/errors.ts', 5),
    rel('packages/database/database.service.ts', 'packages/shared/types.ts', 6),
    rel('packages/database/migrations.ts', 'packages/database/database.service.ts', 5),
    rel('packages/database/migrations.ts', 'packages/shared/types.ts', 6),
    rel('tests/checkout.integration.test.ts', 'apps/api/services/checkout.service.ts', 4),
    rel('tests/checkout.integration.test.ts', 'apps/api/services/payment.service.ts', 5),
    rel('tests/payment.integration.test.ts', 'apps/api/services/payment.service.ts', 4),
  ];
};
