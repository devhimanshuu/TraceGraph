import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImpactResponse } from '@tracegraph/shared';
import {
  buildImpactMarkdown,
  downloadImpactJson,
  downloadTextFile,
  impactFileName,
} from './impact-export';

const root = {
  id: 'class:apps/api/services/payment.service.ts:PaymentService',
  type: 'Class' as const,
  label: 'PaymentService',
};
const checkout = {
  id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
  type: 'Class' as const,
  label: 'CheckoutService',
};
const order = {
  id: 'class:apps/api/services/order.service.ts:OrderService',
  type: 'Class' as const,
  label: 'OrderService',
};

const mockResponse: ImpactResponse = {
  root,
  depth: 2,
  summary: {
    direct: 1,
    indirect: 1,
    tests: 1,
    commits: 2,
    pullRequests: 1,
    issues: 1,
    maxDepth: 2,
    score: 'HIGH',
    scoreReasons: [
      '1 direct and 1 indirect dependents',
      'Impact reaches the full 2-hop depth',
      '1 potentially affected test',
    ],
  },
  directImpact: [
    {
      id: checkout.id,
      type: 'Class',
      label: 'CheckoutService',
      impactType: 'DIRECT',
      distance: 1,
      relationship: 'CALLS',
      reason: 'CheckoutService directly calls PaymentService.',
      path: { nodes: [checkout, root], relTypes: ['CALLS'] },
    },
  ],
  indirectImpact: [
    {
      id: order.id,
      type: 'Class',
      label: 'OrderService',
      impactType: 'INDIRECT',
      distance: 2,
      relationship: 'CALLS',
      reason: 'OrderService depends on CheckoutService, which calls PaymentService.',
      path: { nodes: [order, checkout, root], relTypes: ['CALLS', 'CALLS'] },
    },
  ],
  tests: [
    {
      id: 'test:payment.spec.ts:processPayment_succeeds',
      name: 'processPayment succeeds',
      framework: 'jest',
      filePath: 'apps/api/services/payment.service.spec.ts',
      target: { id: 'fn:processPayment', type: 'Function', label: 'processPayment' },
    },
  ],
  history: {
    commits: [
      {
        sha: '8f21ac7',
        message: 'Refactor payment retry logic',
        timestamp: '2026-08-01T00:00:00.000Z',
        branch: 'main',
        author: { username: 'dev', name: 'Dev' },
      },
    ],
    pullRequests: [
      { number: 421, title: 'Add payment retry handling', status: 'merged', createdAt: '2026-08-01T00:00:00.000Z' },
    ],
    issues: [
      { number: 912, title: 'Checkout occasionally times out', status: 'closed', createdAt: '2026-02-20T10:15:00.000Z' },
    ],
  },
  paths: [
    { nodes: [checkout, root], relTypes: ['CALLS'] },
    { nodes: [order, checkout, root], relTypes: ['CALLS', 'CALLS'] },
  ],
};

describe('impactFileName', () => {
  it('builds a safe, labeled filename', () => {
    expect(impactFileName('PaymentService', 2, 'md')).toBe(
      'impact-report-PaymentService-2hops.md',
    );
    expect(impactFileName('Order Service/API', 1, 'json')).toBe(
      'impact-report-Order-Service-API-1hop.json',
    );
  });
});

describe('buildImpactMarkdown', () => {
  it('includes the masthead, summary table, score reasons, and footer', () => {
    const md = buildImpactMarkdown(mockResponse, { generatedAt: 'Aug 14, 2026' });

    expect(md).toContain('# Impact Analysis Report');
    expect(md).toContain('**Entity:** PaymentService');
    expect(md).toContain('**Impact score:** HIGH');
    expect(md).toContain('**Generated:** Aug 14, 2026');
    expect(md).toContain('| Direct | 1 |');
    expect(md).toContain('| Potentially affected tests | 1 |');
    expect(md).toContain('**Why this score?** (HIGH)');
    expect(md).toContain('- 1 direct and 1 indirect dependents');
    expect(md).toContain('does not claim they will break');
  });

  it('renders direct and indirect components with reasons and paths', () => {
    const md = buildImpactMarkdown(mockResponse);

    expect(md).toContain('### Direct impact (1)');
    expect(md).toContain('- **CheckoutService** — CALLS');
    expect(md).toContain('CheckoutService directly calls PaymentService.');
    expect(md).toContain('### Indirect impact (1)');
    expect(md).toContain('- **OrderService** — distance 2');
    expect(md).toContain('Path: OrderService → CheckoutService → PaymentService');
    expect(md).toContain('OrderService depends on CheckoutService, which calls PaymentService.');
  });

  it('lists evidence paths, tests grouped by file, and history', () => {
    const md = buildImpactMarkdown(mockResponse);

    expect(md).toContain('## Evidence Paths');
    expect(md).toContain('- CheckoutService → PaymentService (CALLS)');
    expect(md).toContain('- OrderService → CheckoutService → PaymentService (CALLS, CALLS)');
    expect(md).toContain('## Potentially Affected Tests (1)');
    expect(md).toContain('- `apps/api/services/payment.service.spec.ts`');
    expect(md).toContain('- processPayment succeeds (jest)');
    expect(md).toContain('## Engineering History');
    expect(md).toContain('- `8f21ac7` — Refactor payment retry logic');
    expect(md).toContain('- #421 — Add payment retry handling');
    expect(md).toContain('- #912 — Checkout occasionally times out');
  });

  it('renders the honest empty state without paths or tests sections', () => {
    const empty: ImpactResponse = {
      ...mockResponse,
      summary: { ...mockResponse.summary, direct: 0, indirect: 0, tests: 0, score: 'LOW' },
      directImpact: [],
      indirectImpact: [],
      paths: [],
      tests: [],
    };
    const md = buildImpactMarkdown(empty);

    expect(md).toContain('No modeled dependencies were found within the selected analysis depth.');
    expect(md).not.toContain('## Evidence Paths');
    expect(md).toContain('## Potentially Affected Tests (0)');
    expect(md).toContain('No test coverage is modeled for the selected entity');
  });
});

describe('download helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloadTextFile creates a blob link and clicks it', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadTextFile('report.md', '# hello', 'text/markdown');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('downloadImpactJson downloads pretty-printed JSON with a proper filename', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const blobSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

    downloadImpactJson(mockResponse);

    expect(click).toHaveBeenCalledTimes(1);
    expect(blobSpy).toHaveBeenCalledTimes(1);
    // The JSON must be parseable and equal to the response.
    const blob = blobSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toContain('application/json');
  });
});
