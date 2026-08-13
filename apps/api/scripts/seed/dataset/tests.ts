/**
 * Test data — `(:Test)-[:TESTS]->(:Function)`.
 *
 * The TEST coverage deliberately concentrates on the demo-critical code paths
 * (checkout, payments, refunds) so the future impact analysis can answer
 * "which tests could break if I change PaymentService".
 */
import type { SeedNode, SeedRel } from '../types';
import { fnId, testId } from '../ids';

export interface TestSpec {
  file: string;
  name: string;
  framework: string;
  /** Target function being tested. */
  targetFile: string;
  targetFn: string;
}

export const TESTS: TestSpec[] = [
  // checkout
  {
    file: 'apps/api/services/checkout.service.spec.ts',
    name: 'processCheckout completes successfully',
    framework: 'jest',
    targetFile: 'apps/api/services/checkout.service.ts',
    targetFn: 'processCheckout',
  },
  {
    file: 'apps/api/services/checkout.service.spec.ts',
    name: 'processCheckout fails when cart is invalid',
    framework: 'jest',
    targetFile: 'apps/api/services/checkout.service.ts',
    targetFn: 'validateCart',
  },
  {
    file: 'apps/api/services/checkout.service.spec.ts',
    name: 'processCheckout times out gracefully',
    framework: 'jest',
    targetFile: 'apps/api/services/checkout.service.ts',
    targetFn: 'processCheckout',
  },
  // payments
  {
    file: 'apps/api/services/payment.service.spec.ts',
    name: 'processPayment succeeds',
    framework: 'jest',
    targetFile: 'apps/api/services/payment.service.ts',
    targetFn: 'processPayment',
  },
  {
    file: 'apps/api/services/payment.service.spec.ts',
    name: 'processPayment declines card',
    framework: 'jest',
    targetFile: 'apps/api/services/payment.service.ts',
    targetFn: 'processPayment',
  },
  {
    file: 'apps/api/services/payment.service.spec.ts',
    name: 'processPayment retries transient failures',
    framework: 'jest',
    targetFile: 'apps/api/services/payment.service.ts',
    targetFn: 'processPayment',
  },
  {
    file: 'apps/api/services/payment.service.spec.ts',
    name: 'handleWebhook ignores duplicate events',
    framework: 'jest',
    targetFile: 'apps/api/services/payment.service.ts',
    targetFn: 'handleWebhook',
  },
  // orders
  {
    file: 'apps/api/services/order.service.spec.ts',
    name: 'createOrder persists the order',
    framework: 'jest',
    targetFile: 'apps/api/services/order.service.ts',
    targetFn: 'createOrder',
  },
  {
    file: 'apps/api/services/order.service.spec.ts',
    name: 'retryPendingCheckout re-runs checkout',
    framework: 'jest',
    targetFile: 'apps/api/services/order.service.ts',
    targetFn: 'retryPendingCheckout',
  },
  {
    file: 'apps/api/services/order.service.spec.ts',
    name: 'markPaid updates order status',
    framework: 'jest',
    targetFile: 'apps/api/services/order.service.ts',
    targetFn: 'markPaid',
  },
  // refunds
  {
    file: 'apps/api/services/refund.service.spec.ts',
    name: 'refund full amount',
    framework: 'jest',
    targetFile: 'apps/api/services/refund.service.ts',
    targetFn: 'refund',
  },
  {
    file: 'apps/api/services/refund.service.spec.ts',
    name: 'refund rejects overpayment',
    framework: 'jest',
    targetFile: 'apps/api/services/refund.service.ts',
    targetFn: 'refund',
  },
  // auth & users
  {
    file: 'apps/api/services/auth.service.spec.ts',
    name: 'login returns a token',
    framework: 'jest',
    targetFile: 'apps/api/services/auth.service.ts',
    targetFn: 'login',
  },
  {
    file: 'apps/api/services/auth.service.spec.ts',
    name: 'login rejects bad credentials',
    framework: 'jest',
    targetFile: 'apps/api/services/auth.service.ts',
    targetFn: 'login',
  },
  {
    file: 'apps/api/services/user.service.spec.ts',
    name: 'findById returns the profile',
    framework: 'jest',
    targetFile: 'apps/api/services/user.service.ts',
    targetFn: 'findById',
  },
  // notifications & lib
  {
    file: 'apps/api/services/notification.service.spec.ts',
    name: 'notify sends an email',
    framework: 'jest',
    targetFile: 'apps/api/services/notification.service.ts',
    targetFn: 'notify',
  },
  {
    file: 'apps/api/services/auth.service.spec.ts',
    name: 'refreshToken validates expired tokens',
    framework: 'jest',
    targetFile: 'apps/api/services/auth.service.ts',
    targetFn: 'refreshToken',
  },
  // integration
  {
    file: 'tests/checkout.integration.test.ts',
    name: 'checkout end-to-end',
    framework: 'jest',
    targetFile: 'apps/api/services/checkout.service.ts',
    targetFn: 'processCheckout',
  },
  {
    file: 'tests/payment.integration.test.ts',
    name: 'payment end-to-end',
    framework: 'jest',
    targetFile: 'apps/api/services/payment.service.ts',
    targetFn: 'processPayment',
  },
];

export const testNodes = (): SeedNode[] =>
  TESTS.map((t) => ({
    label: 'Test' as const,
    props: {
      id: testId(t.file, t.name),
      name: t.name,
      framework: t.framework,
      filePath: t.file,
    },
  }));

export const testRels = (): SeedRel[] =>
  TESTS.map((t) => ({
    type: 'TESTS' as const,
    fromLabel: 'Test' as const,
    toLabel: 'Function' as const,
    from: testId(t.file, t.name),
    to: fnId(t.targetFile, t.targetFn),
  }));
