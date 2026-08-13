/**
 * TraceGraph graph verification (Phase 4 §22–23, §40).
 *
 * Usage:  npm run db:verify   (from apps/api or the repo root)
 *
 * Verifies against the live CognoDB instance:
 *   1. Node counts per label match the deterministic dataset definition.
 *   2. Relationship counts per type match the dataset definition.
 *   3. Critical demo entities exist (PaymentService, CheckoutService,
 *      OrderService, StripeClient, commit 8f21ac7, PR #421, issue #912).
 *   4. Critical multi-hop traversals resolve:
 *        P1  OrderService.retryPendingCheckout → CheckoutService.processCheckout
 *              → PaymentService.processPayment            (2 hops)
 *        P2  CheckoutController.processCheckout → CheckoutService.processCheckout
 *              → PaymentService.processPayment            (2 hops)
 *        P3  OrderController.createOrder → OrderService.createOrder
 *              → OrderRepository.save → DatabaseService.query (3 hops)
 *        P4  Issue #912 → PR #421 → Commit 8f21ac7 → payment.service.ts (3 hops)
 *   5. Integrity: no orphaned nodes where the model requires a parent
 *      (Files in a Directory, Functions/Classes in a File, Tests testing
 *      something, Commits modifying files and authored by someone, PRs with
 *      commits, Issues related to a PR).
 *
 * Counts come back from the driver as `Integer` objects; `toNumber()` converts.
 * Labels/types are interpolated into Cypher from fixed whitelists only.
 */
import { bootstrapDb } from './bootstrap';
import { buildDataset } from './seed/dataset';
import { classId, commitId, fileId, fnId, issueId, prId } from './seed/ids';
import { REPOSITORY_ID } from './seed/dataset/files';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const toNumber = (v: unknown): number => {
  if (v && typeof v === 'object' && 'toNumber' in (v as { toNumber?: unknown })) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
};

async function count(
  db: Awaited<ReturnType<typeof bootstrapDb>>['db'],
  label: string,
): Promise<number> {
  const rows = await db.executeRead<{ c: unknown }[]>(
    (tx) => tx.run<{ c: unknown }>(`MATCH (n:\`${label}\`) RETURN count(n) AS c`),
    { name: `verify-count-${label}` },
  );
  return toNumber(rows[0]?.c);
}

async function main(): Promise<void> {
  const { db, close } = await bootstrapDb();
  const dataset = buildDataset();
  console.log('TraceGraph graph verification\n');

  // 1. Node counts vs dataset definition.
  console.log('── Node counts ──');
  const nodeCounts = new Map<string, number>();
  for (const node of dataset.nodes) {
    nodeCounts.set(node.label, (nodeCounts.get(node.label) ?? 0) + 1);
  }
  for (const [label, expected] of nodeCounts) {
    const actual = await count(db, label);
    record(`Node count ${label}`, actual === expected, `${actual} (expected ${expected})`);
  }

  // 2. Relationship counts vs dataset definition.
  console.log('\n── Relationship counts ──');
  const relCounts = new Map<string, number>();
  for (const rel of dataset.rels) {
    relCounts.set(rel.type, (relCounts.get(rel.type) ?? 0) + 1);
  }
  for (const [type, expected] of relCounts) {
    const rows = await db.executeRead<{ c: unknown }[]>(
      (tx) => tx.run<{ c: unknown }>(`MATCH ()-[r:\`${type}\`]->() RETURN count(r) AS c`),
      { name: `verify-rel-${type}` },
    );
    const actual = toNumber(rows[0]?.c);
    record(`Relationship count ${type}`, actual === expected, `${actual} (expected ${expected})`);
  }

  // 3. Critical entities.
  console.log('\n── Critical entities ──');
  const entityChecks: Array<[string, string, string]> = [
    ['Repository', 'Repository', REPOSITORY_ID],
    [
      'Class PaymentService',
      'Class',
      classId('apps/api/services/payment.service.ts', 'PaymentService'),
    ],
    [
      'Class CheckoutService',
      'Class',
      classId('apps/api/services/checkout.service.ts', 'CheckoutService'),
    ],
    ['Class OrderService', 'Class', classId('apps/api/services/order.service.ts', 'OrderService')],
    ['Class StripeClient', 'Class', classId('lib/stripe.client.ts', 'StripeClient')],
    ['Commit 8f21ac7', 'Commit', commitId('8f21ac7')],
    ['PullRequest #421', 'PullRequest', prId(421)],
    ['Issue #912', 'Issue', issueId(912)],
  ];
  for (const [name, label, id] of entityChecks) {
    const rows = await db.executeRead<{ found: unknown }[]>(
      (tx) =>
        tx.run<{ found: unknown }>(`MATCH (n:\`${label}\` {id: $id}) RETURN count(n) AS found`, {
          id,
        }),
      { name: `verify-entity-${name.replace(/\W+/g, '_')}` },
    );
    record(`Entity ${name}`, toNumber(rows[0]?.found) === 1, id);
  }

  // 4. Critical multi-hop traversals.
  console.log('\n── Critical paths ──');
  const pathChecks: Array<[string, string, Record<string, string>]> = [
    [
      'P1 2-hop: OrderService → CheckoutService → PaymentService',
      `MATCH (a:Function {id: $a})-[:CALLS]->(b:Function {id: $b})-[:CALLS]->(c:Function {id: $c})
       RETURN count(*) AS found`,
      {
        a: fnId('apps/api/services/order.service.ts', 'retryPendingCheckout'),
        b: fnId('apps/api/services/checkout.service.ts', 'processCheckout'),
        c: fnId('apps/api/services/payment.service.ts', 'processPayment'),
      },
    ],
    [
      'P2 2-hop: CheckoutController → CheckoutService → PaymentService',
      `MATCH (a:Function {id: $a})-[:CALLS]->(b:Function {id: $b})-[:CALLS]->(c:Function {id: $c})
       RETURN count(*) AS found`,
      {
        a: fnId('apps/api/controllers/checkout.controller.ts', 'processCheckout'),
        b: fnId('apps/api/services/checkout.service.ts', 'processCheckout'),
        c: fnId('apps/api/services/payment.service.ts', 'processPayment'),
      },
    ],
    [
      'P3 3-hop: OrderController → OrderService → OrderRepository → DatabaseService',
      `MATCH (a:Function {id: $a})-[:CALLS]->(b:Function {id: $b})-[:CALLS]->(c:Function {id: $c})-[:CALLS]->(d:Function {id: $d})
       RETURN count(*) AS found`,
      {
        a: fnId('apps/api/controllers/order.controller.ts', 'createOrder'),
        b: fnId('apps/api/services/order.service.ts', 'createOrder'),
        c: fnId('apps/api/repositories/order.repository.ts', 'save'),
        d: fnId('packages/database/database.service.ts', 'query'),
      },
    ],
    [
      'P4 3-hop history: Issue #912 → PR #421 → Commit 8f21ac7 → payment.service.ts',
      `MATCH (i:Issue {id: $i})-[:RELATED_TO]->(pr:PullRequest {id: $pr})-[:CONTAINS]->(c:Commit {id: $c})-[:MODIFIES]->(f:File {id: $f})
       RETURN count(*) AS found`,
      {
        i: issueId(912),
        pr: prId(421),
        c: commitId('8f21ac7'),
        f: fileId('apps/api/services/payment.service.ts'),
      },
    ],
    [
      'P5 2-hop: PaymentService.processPayment → PaymentRepository → DatabaseService',
      `MATCH (a:Function {id: $a})-[:CALLS]->(b:Function {id: $b})-[:CALLS]->(c:Function {id: $c})
       RETURN count(*) AS found`,
      {
        a: fnId('apps/api/services/payment.service.ts', 'processPayment'),
        b: fnId('apps/api/repositories/payment.repository.ts', 'createTransaction'),
        c: fnId('packages/database/database.service.ts', 'query'),
      },
    ],
  ];
  for (const [name, cypher, params] of pathChecks) {
    const rows = await db.executeRead<{ found: unknown }[]>(
      (tx) => tx.run<{ found: unknown }>(cypher, params),
      {
        name: `verify-path-${name.replace(/\W+/g, '_')}`,
      },
    );
    const found = toNumber(rows[0]?.found);
    record(name, found >= 1, `found ${found}`);
  }

  // 5. Integrity checks — every check must report 0 offenders.
  console.log('\n── Integrity ──');
  const integrityChecks: Array<[string, string]> = [
    [
      'File without a containing Directory',
      'MATCH (n:File) WHERE NOT (n)<-[:CONTAINS]-(:Directory) RETURN count(n) AS c',
    ],
    [
      'Class without a containing File',
      'MATCH (n:Class) WHERE NOT (n)<-[:CONTAINS]-(:File) RETURN count(n) AS c',
    ],
    [
      'Function without a containing File',
      'MATCH (n:Function) WHERE NOT (n)<-[:CONTAINS]-(:File) RETURN count(n) AS c',
    ],
    [
      'Test without a TESTS target',
      'MATCH (n:Test) WHERE NOT (n)-[:TESTS]->(:Function) RETURN count(n) AS c',
    ],
    [
      'Commit without a MODIFIES target',
      'MATCH (n:Commit) WHERE NOT (n)-[:MODIFIES]->(:File) RETURN count(n) AS c',
    ],
    [
      'Commit without an author',
      'MATCH (n:Commit) WHERE NOT (n)-[:AUTHORED_BY]->(:Developer) RETURN count(n) AS c',
    ],
    [
      'PullRequest without commits',
      'MATCH (n:PullRequest) WHERE NOT (n)-[:CONTAINS]->(:Commit) RETURN count(n) AS c',
    ],
    [
      'Issue without a related PR',
      'MATCH (n:Issue) WHERE NOT (n)-[:RELATED_TO]->(:PullRequest) RETURN count(n) AS c',
    ],
  ];
  for (const [name, cypher] of integrityChecks) {
    const rows = await db.executeRead<{ c: unknown }[]>((tx) => tx.run<{ c: unknown }>(cypher), {
      name: `verify-integrity-${name.replace(/\W+/g, '_')}`,
    });
    const offenders = toNumber(rows[0]?.c);
    record(name, offenders === 0, offenders === 0 ? '0 offenders' : `${offenders} offender(s)`);
  }

  // ── Summary ──
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${failed.length === 0 ? 'All checks passed.' : `${failed.length} check(s) FAILED.`}`,
  );
  if (failed.length > 0) {
    for (const f of failed) {
      console.log(`  ✗ ${f.name}: ${f.detail}`);
    }
    process.exitCode = 1;
  }
  await close();
}

main().catch((err) => {
  console.error('Verification failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
