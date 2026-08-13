/**
 * Symbol-level data: Classes, Functions, the CALLS call graph, and EXTENDS.
 *
 * This is the heart of the graph. The CALLS edges are deliberately structured
 * so the impact-analysis demo can show multi-hop traversal:
 *
 *   OrderService.retryPendingCheckout
 *     ─CALLS→ CheckoutService.processCheckout
 *       ─CALLS→ PaymentService.processPayment
 *         ─CALLS→ PaymentRepository.createTransaction
 *           ─CALLS→ DatabaseService.query
 *
 * Traversing `<-[:CALLS]-` (who calls me) from PaymentService.processPayment
 * reaches CheckoutService and, two hops up, OrderService — exactly the
 * "what breaks if I change PaymentService" story.
 */
import type { SeedNode, SeedRel } from '../types';
import { classId, fnId } from '../ids';

export interface ClassSpec {
  file: string;
  name: string;
  lineStart: number;
  lineEnd: number;
}

export interface FnSpec {
  file: string;
  name: string;
  signature: string;
  lineStart: number;
  lineEnd: number;
  visibility: 'public' | 'private' | 'internal';
}

export const CLASSES: ClassSpec[] = [
  // controllers
  {
    file: 'apps/api/controllers/auth.controller.ts',
    name: 'AuthController',
    lineStart: 8,
    lineEnd: 38,
  },
  {
    file: 'apps/api/controllers/checkout.controller.ts',
    name: 'CheckoutController',
    lineStart: 10,
    lineEnd: 46,
  },
  {
    file: 'apps/api/controllers/order.controller.ts',
    name: 'OrderController',
    lineStart: 8,
    lineEnd: 54,
  },
  {
    file: 'apps/api/controllers/payment.controller.ts',
    name: 'PaymentController',
    lineStart: 10,
    lineEnd: 60,
  },
  {
    file: 'apps/api/controllers/user.controller.ts',
    name: 'UserController',
    lineStart: 8,
    lineEnd: 40,
  },
  // services
  { file: 'apps/api/services/auth.service.ts', name: 'AuthService', lineStart: 12, lineEnd: 82 },
  {
    file: 'apps/api/services/checkout.service.ts',
    name: 'CheckoutService',
    lineStart: 14,
    lineEnd: 100,
  },
  {
    file: 'apps/api/services/notification.service.ts',
    name: 'NotificationService',
    lineStart: 10,
    lineEnd: 90,
  },
  { file: 'apps/api/services/order.service.ts', name: 'OrderService', lineStart: 12, lineEnd: 132 },
  {
    file: 'apps/api/services/payment.service.ts',
    name: 'PaymentService',
    lineStart: 14,
    lineEnd: 144,
  },
  {
    file: 'apps/api/services/refund.service.ts',
    name: 'RefundService',
    lineStart: 10,
    lineEnd: 78,
  },
  { file: 'apps/api/services/user.service.ts', name: 'UserService', lineStart: 10, lineEnd: 58 },
  // repositories
  {
    file: 'apps/api/repositories/order.repository.ts',
    name: 'OrderRepository',
    lineStart: 8,
    lineEnd: 70,
  },
  {
    file: 'apps/api/repositories/payment.repository.ts',
    name: 'PaymentRepository',
    lineStart: 8,
    lineEnd: 72,
  },
  {
    file: 'apps/api/repositories/user.repository.ts',
    name: 'UserRepository',
    lineStart: 8,
    lineEnd: 48,
  },
  // packages
  {
    file: 'packages/database/database.service.ts',
    name: 'DatabaseService',
    lineStart: 10,
    lineEnd: 86,
  },
  { file: 'packages/shared/errors.ts', name: 'AppError', lineStart: 8, lineEnd: 26 },
  { file: 'packages/shared/errors.ts', name: 'ValidationError', lineStart: 28, lineEnd: 40 },
  { file: 'packages/shared/errors.ts', name: 'NotFoundError', lineStart: 42, lineEnd: 54 },
  // lib
  { file: 'lib/stripe.client.ts', name: 'StripeClient', lineStart: 12, lineEnd: 96 },
  { file: 'lib/token.service.ts', name: 'TokenService', lineStart: 10, lineEnd: 60 },
];

export const FUNCTIONS: FnSpec[] = [
  // ── controllers ────────────────────────────────────────────────────────────
  {
    file: 'apps/api/controllers/auth.controller.ts',
    name: 'login',
    signature: 'login(dto: LoginDto): Promise<TokenResponse>',
    lineStart: 12,
    lineEnd: 28,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/auth.controller.ts',
    name: 'logout',
    signature: 'logout(req: Request): Promise<void>',
    lineStart: 30,
    lineEnd: 34,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/checkout.controller.ts',
    name: 'processCheckout',
    signature: 'processCheckout(dto: CheckoutDto): Promise<CheckoutResult>',
    lineStart: 14,
    lineEnd: 32,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/checkout.controller.ts',
    name: 'getCheckoutStatus',
    signature: 'getCheckoutStatus(orderId: string): Promise<CheckoutStatus>',
    lineStart: 34,
    lineEnd: 42,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/notification.controller.ts',
    name: 'listNotifications',
    signature: 'listNotifications(userId: string): Promise<Notification[]>',
    lineStart: 12,
    lineEnd: 26,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/order.controller.ts',
    name: 'createOrder',
    signature: 'createOrder(dto: CreateOrderDto): Promise<Order>',
    lineStart: 12,
    lineEnd: 28,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/order.controller.ts',
    name: 'getOrder',
    signature: 'getOrder(orderId: string): Promise<Order>',
    lineStart: 30,
    lineEnd: 38,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/order.controller.ts',
    name: 'listOrders',
    signature: 'listOrders(userId: string, page: number): Promise<Page<Order>>',
    lineStart: 40,
    lineEnd: 52,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/payment.controller.ts',
    name: 'createPayment',
    signature: 'createPayment(dto: CreatePaymentDto): Promise<Payment>',
    lineStart: 14,
    lineEnd: 30,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/payment.controller.ts',
    name: 'getPaymentStatus',
    signature: 'getPaymentStatus(paymentId: string): Promise<PaymentStatus>',
    lineStart: 32,
    lineEnd: 40,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/payment.controller.ts',
    name: 'handleWebhook',
    signature: 'handleWebhook(event: StripeEvent): Promise<void>',
    lineStart: 42,
    lineEnd: 58,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/user.controller.ts',
    name: 'getUser',
    signature: 'getUser(userId: string): Promise<User>',
    lineStart: 12,
    lineEnd: 24,
    visibility: 'public',
  },
  {
    file: 'apps/api/controllers/user.controller.ts',
    name: 'updateUser',
    signature: 'updateUser(userId: string, dto: UpdateUserDto): Promise<User>',
    lineStart: 26,
    lineEnd: 38,
    visibility: 'public',
  },

  // ── services ───────────────────────────────────────────────────────────────
  {
    file: 'apps/api/services/auth.service.ts',
    name: 'login',
    signature: 'login(email: string, password: string): Promise<TokenResponse>',
    lineStart: 18,
    lineEnd: 46,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/auth.service.ts',
    name: 'logout',
    signature: 'logout(sessionId: string): Promise<void>',
    lineStart: 48,
    lineEnd: 54,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/auth.service.ts',
    name: 'refreshToken',
    signature: 'refreshToken(token: string): Promise<TokenResponse>',
    lineStart: 56,
    lineEnd: 78,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/checkout.service.ts',
    name: 'processCheckout',
    signature: 'processCheckout(userId: string, cart: Cart): Promise<CheckoutResult>',
    lineStart: 20,
    lineEnd: 64,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/checkout.service.ts',
    name: 'getCheckoutStatus',
    signature: 'getCheckoutStatus(orderId: string): Promise<CheckoutStatus>',
    lineStart: 66,
    lineEnd: 80,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/checkout.service.ts',
    name: 'validateCart',
    signature: 'validateCart(cart: Cart): Promise<ValidationResult>',
    lineStart: 82,
    lineEnd: 96,
    visibility: 'private',
  },
  {
    file: 'apps/api/services/notification.service.ts',
    name: 'notify',
    signature: 'notify(userId: string, message: NotificationMessage): Promise<void>',
    lineStart: 16,
    lineEnd: 44,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/notification.service.ts',
    name: 'sendEmail',
    signature: 'sendEmail(userId: string, subject: string, body: string): Promise<void>',
    lineStart: 46,
    lineEnd: 70,
    visibility: 'private',
  },
  {
    file: 'apps/api/services/notification.service.ts',
    name: 'sendPush',
    signature: 'sendPush(userId: string, message: string): Promise<void>',
    lineStart: 72,
    lineEnd: 88,
    visibility: 'private',
  },
  {
    file: 'apps/api/services/order.service.ts',
    name: 'createOrder',
    signature: 'createOrder(userId: string, items: OrderItem[]): Promise<Order>',
    lineStart: 18,
    lineEnd: 52,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/order.service.ts',
    name: 'getOrder',
    signature: 'getOrder(orderId: string): Promise<Order>',
    lineStart: 54,
    lineEnd: 66,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/order.service.ts',
    name: 'listOrders',
    signature: 'listOrders(userId: string, page: number): Promise<Page<Order>>',
    lineStart: 68,
    lineEnd: 86,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/order.service.ts',
    name: 'retryPendingCheckout',
    signature: 'retryPendingCheckout(orderId: string): Promise<CheckoutResult>',
    lineStart: 88,
    lineEnd: 112,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/order.service.ts',
    name: 'markPaid',
    signature: 'markPaid(orderId: string, paymentId: string): Promise<Order>',
    lineStart: 114,
    lineEnd: 128,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/payment.service.ts',
    name: 'processPayment',
    signature: 'processPayment(order: Order, method: PaymentMethod): Promise<Payment>',
    lineStart: 20,
    lineEnd: 72,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/payment.service.ts',
    name: 'getPaymentStatus',
    signature: 'getPaymentStatus(paymentId: string): Promise<PaymentStatus>',
    lineStart: 74,
    lineEnd: 86,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/payment.service.ts',
    name: 'handleWebhook',
    signature: 'handleWebhook(event: StripeEvent): Promise<void>',
    lineStart: 88,
    lineEnd: 120,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/payment.service.ts',
    name: 'createPaymentIntent',
    signature: 'createPaymentIntent(order: Order, method: PaymentMethod): Promise<PaymentIntent>',
    lineStart: 122,
    lineEnd: 140,
    visibility: 'private',
  },
  {
    file: 'apps/api/services/refund.service.ts',
    name: 'refund',
    signature: 'refund(paymentId: string, amount: Money): Promise<Refund>',
    lineStart: 16,
    lineEnd: 58,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/refund.service.ts',
    name: 'listRefunds',
    signature: 'listRefunds(userId: string): Promise<Refund[]>',
    lineStart: 60,
    lineEnd: 74,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/user.service.ts',
    name: 'findById',
    signature: 'findById(userId: string): Promise<User>',
    lineStart: 14,
    lineEnd: 32,
    visibility: 'public',
  },
  {
    file: 'apps/api/services/user.service.ts',
    name: 'updateProfile',
    signature: 'updateProfile(userId: string, patch: UpdateUserDto): Promise<User>',
    lineStart: 34,
    lineEnd: 56,
    visibility: 'public',
  },

  // ── repositories ───────────────────────────────────────────────────────────
  {
    file: 'apps/api/repositories/order.repository.ts',
    name: 'save',
    signature: 'save(order: Order): Promise<Order>',
    lineStart: 12,
    lineEnd: 30,
    visibility: 'public',
  },
  {
    file: 'apps/api/repositories/order.repository.ts',
    name: 'findById',
    signature: 'findById(orderId: string): Promise<Order | null>',
    lineStart: 32,
    lineEnd: 46,
    visibility: 'public',
  },
  {
    file: 'apps/api/repositories/order.repository.ts',
    name: 'findByUser',
    signature: 'findByUser(userId: string, page: number): Promise<Order[]>',
    lineStart: 48,
    lineEnd: 66,
    visibility: 'public',
  },
  {
    file: 'apps/api/repositories/payment.repository.ts',
    name: 'createTransaction',
    signature: 'createTransaction(payment: Payment): Promise<Payment>',
    lineStart: 12,
    lineEnd: 34,
    visibility: 'public',
  },
  {
    file: 'apps/api/repositories/payment.repository.ts',
    name: 'findByTransactionId',
    signature: 'findByTransactionId(txId: string): Promise<Payment | null>',
    lineStart: 36,
    lineEnd: 50,
    visibility: 'public',
  },
  {
    file: 'apps/api/repositories/payment.repository.ts',
    name: 'findByOrder',
    signature: 'findByOrder(orderId: string): Promise<Payment[]>',
    lineStart: 52,
    lineEnd: 68,
    visibility: 'public',
  },
  {
    file: 'apps/api/repositories/user.repository.ts',
    name: 'findByEmail',
    signature: 'findByEmail(email: string): Promise<User | null>',
    lineStart: 12,
    lineEnd: 28,
    visibility: 'public',
  },
  {
    file: 'apps/api/repositories/user.repository.ts',
    name: 'findById',
    signature: 'findById(userId: string): Promise<User | null>',
    lineStart: 30,
    lineEnd: 44,
    visibility: 'public',
  },

  // ── packages ───────────────────────────────────────────────────────────────
  {
    file: 'packages/database/database.service.ts',
    name: 'query',
    signature: 'query<T>(cypher: string, params: Record<string, unknown>): Promise<T[]>',
    lineStart: 16,
    lineEnd: 44,
    visibility: 'public',
  },
  {
    file: 'packages/database/database.service.ts',
    name: 'transaction',
    signature: 'transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>',
    lineStart: 46,
    lineEnd: 72,
    visibility: 'public',
  },
  {
    file: 'packages/database/database.service.ts',
    name: 'healthCheck',
    signature: 'healthCheck(): Promise<{ status: string }>',
    lineStart: 74,
    lineEnd: 82,
    visibility: 'public',
  },
  {
    file: 'packages/database/migrations.ts',
    name: 'runMigrations',
    signature: 'runMigrations(): Promise<void>',
    lineStart: 12,
    lineEnd: 48,
    visibility: 'public',
  },
  {
    file: 'packages/database/migrations.ts',
    name: 'seedReferenceData',
    signature: 'seedReferenceData(): Promise<void>',
    lineStart: 50,
    lineEnd: 70,
    visibility: 'public',
  },
  {
    file: 'packages/shared/errors.ts',
    name: 'toAppError',
    signature: 'toAppError(err: unknown): AppError',
    lineStart: 60,
    lineEnd: 78,
    visibility: 'internal',
  },

  // ── lib ────────────────────────────────────────────────────────────────────
  {
    file: 'lib/stripe.client.ts',
    name: 'charge',
    signature: 'charge(customerId: string, amount: Money): Promise<Charge>',
    lineStart: 18,
    lineEnd: 52,
    visibility: 'public',
  },
  {
    file: 'lib/stripe.client.ts',
    name: 'refund',
    signature: 'refund(transactionId: string, amount: Money): Promise<Refund>',
    lineStart: 54,
    lineEnd: 76,
    visibility: 'public',
  },
  {
    file: 'lib/stripe.client.ts',
    name: 'getPaymentMethod',
    signature: 'getPaymentMethod(customerId: string): Promise<PaymentMethod>',
    lineStart: 78,
    lineEnd: 92,
    visibility: 'public',
  },
  {
    file: 'lib/token.service.ts',
    name: 'sign',
    signature: 'sign(payload: TokenPayload): Promise<string>',
    lineStart: 14,
    lineEnd: 34,
    visibility: 'public',
  },
  {
    file: 'lib/token.service.ts',
    name: 'verify',
    signature: 'verify(token: string): Promise<TokenPayload>',
    lineStart: 36,
    lineEnd: 58,
    visibility: 'public',
  },
  {
    file: 'lib/events.ts',
    name: 'emit',
    signature: 'emit(event: string, payload: unknown): Promise<void>',
    lineStart: 12,
    lineEnd: 28,
    visibility: 'public',
  },
  {
    file: 'lib/events.ts',
    name: 'subscribe',
    signature: 'subscribe(event: string, handler: (payload: unknown) => void): () => void',
    lineStart: 30,
    lineEnd: 48,
    visibility: 'public',
  },
  {
    file: 'lib/logger.ts',
    name: 'info',
    signature: 'info(message: string, meta?: unknown): void',
    lineStart: 10,
    lineEnd: 16,
    visibility: 'public',
  },
  {
    file: 'lib/logger.ts',
    name: 'error',
    signature: 'error(message: string, meta?: unknown): void',
    lineStart: 18,
    lineEnd: 26,
    visibility: 'public',
  },
  {
    file: 'lib/logger.ts',
    name: 'warn',
    signature: 'warn(message: string): void',
    lineStart: 28,
    lineEnd: 34,
    visibility: 'public',
  },
  {
    file: 'lib/http.ts',
    name: 'post',
    signature: 'post<T>(url: string, body: unknown, headers?: Headers): Promise<T>',
    lineStart: 14,
    lineEnd: 40,
    visibility: 'public',
  },
  {
    file: 'lib/http.ts',
    name: 'get',
    signature: 'get<T>(url: string, headers?: Headers): Promise<T>',
    lineStart: 42,
    lineEnd: 62,
    visibility: 'public',
  },

  // ── web ────────────────────────────────────────────────────────────────────
  {
    file: 'apps/web/checkout.page.tsx',
    name: 'useCheckout',
    signature: 'useCheckout(): UseCheckout',
    lineStart: 8,
    lineEnd: 40,
    visibility: 'internal',
  },
  {
    file: 'apps/web/order.page.tsx',
    name: 'useOrders',
    signature: 'useOrders(): UseOrders',
    lineStart: 8,
    lineEnd: 42,
    visibility: 'internal',
  },
  {
    file: 'apps/web/payment.page.tsx',
    name: 'usePayment',
    signature: 'usePayment(): UsePayment',
    lineStart: 8,
    lineEnd: 38,
    visibility: 'internal',
  },
];

export const classNodes = (): SeedNode[] =>
  CLASSES.map((c) => ({
    label: 'Class' as const,
    props: {
      id: classId(c.file, c.name),
      name: c.name,
      filePath: c.file,
      lineStart: c.lineStart,
      lineEnd: c.lineEnd,
    },
  }));

export const functionNodes = (): SeedNode[] =>
  FUNCTIONS.map((f) => ({
    label: 'Function' as const,
    props: {
      id: fnId(f.file, f.name),
      name: f.name,
      signature: f.signature,
      lineStart: f.lineStart,
      lineEnd: f.lineEnd,
      visibility: f.visibility,
    },
  }));

/** File CONTAINS Class / File CONTAINS Function (Phase 1 decision: classes own their methods). */
export const containmentRels = (): SeedRel[] => [
  ...CLASSES.map((c) => ({
    type: 'CONTAINS' as const,
    fromLabel: 'File' as const,
    toLabel: 'Class' as const,
    from: `file:${c.file}`,
    to: classId(c.file, c.name),
  })),
  ...FUNCTIONS.map((f) => ({
    type: 'CONTAINS' as const,
    fromLabel: 'File' as const,
    toLabel: 'Function' as const,
    from: `file:${f.file}`,
    to: fnId(f.file, f.name),
  })),
];

/**
 * Call graph — `A -[:CALLS]-> B` means "function A calls function B".
 * Deliberately not a fully connected graph; mirrors a real codebase.
 */
export const callRels = (): SeedRel[] => {
  const call = (
    fromFile: string,
    fromFn: string,
    toFile: string,
    toFn: string,
    count = 1,
  ): SeedRel => ({
    type: 'CALLS',
    fromLabel: 'Function',
    toLabel: 'Function',
    from: fnId(fromFile, fromFn),
    to: fnId(toFile, toFn),
    props: { count },
  });

  return [
    // controllers → services
    call(
      'apps/api/controllers/auth.controller.ts',
      'login',
      'apps/api/services/auth.service.ts',
      'login',
    ),
    call(
      'apps/api/controllers/auth.controller.ts',
      'logout',
      'apps/api/services/auth.service.ts',
      'logout',
    ),
    call(
      'apps/api/controllers/checkout.controller.ts',
      'processCheckout',
      'apps/api/services/checkout.service.ts',
      'processCheckout',
    ),
    call(
      'apps/api/controllers/checkout.controller.ts',
      'getCheckoutStatus',
      'apps/api/services/checkout.service.ts',
      'getCheckoutStatus',
    ),

    call(
      'apps/api/controllers/order.controller.ts',
      'createOrder',
      'apps/api/services/order.service.ts',
      'createOrder',
    ),
    call(
      'apps/api/controllers/order.controller.ts',
      'getOrder',
      'apps/api/services/order.service.ts',
      'getOrder',
    ),
    call(
      'apps/api/controllers/order.controller.ts',
      'listOrders',
      'apps/api/services/order.service.ts',
      'listOrders',
    ),
    call(
      'apps/api/controllers/payment.controller.ts',
      'createPayment',
      'apps/api/services/payment.service.ts',
      'processPayment',
    ),
    call(
      'apps/api/controllers/payment.controller.ts',
      'getPaymentStatus',
      'apps/api/services/payment.service.ts',
      'getPaymentStatus',
    ),
    call(
      'apps/api/controllers/payment.controller.ts',
      'handleWebhook',
      'apps/api/services/payment.service.ts',
      'handleWebhook',
    ),
    call(
      'apps/api/controllers/user.controller.ts',
      'getUser',
      'apps/api/services/user.service.ts',
      'findById',
    ),
    call(
      'apps/api/controllers/user.controller.ts',
      'updateUser',
      'apps/api/services/user.service.ts',
      'updateProfile',
    ),

    // auth
    call(
      'apps/api/services/auth.service.ts',
      'login',
      'apps/api/repositories/user.repository.ts',
      'findByEmail',
    ),
    call('apps/api/services/auth.service.ts', 'login', 'lib/token.service.ts', 'sign'),
    call('apps/api/services/auth.service.ts', 'refreshToken', 'lib/token.service.ts', 'verify'),

    // checkout — the critical multi-hop chain
    call(
      'apps/api/services/checkout.service.ts',
      'processCheckout',
      'apps/api/services/order.service.ts',
      'createOrder',
      2,
    ),
    call(
      'apps/api/services/checkout.service.ts',
      'processCheckout',
      'apps/api/services/payment.service.ts',
      'processPayment',
    ),
    call(
      'apps/api/services/checkout.service.ts',
      'processCheckout',
      'apps/api/services/notification.service.ts',
      'notify',
    ),
    call(
      'apps/api/services/checkout.service.ts',
      'validateCart',
      'apps/api/repositories/user.repository.ts',
      'findById',
    ),
    call(
      'apps/api/services/checkout.service.ts',
      'getCheckoutStatus',
      'apps/api/services/payment.service.ts',
      'getPaymentStatus',
    ),

    // notifications
    call('apps/api/services/notification.service.ts', 'notify', 'lib/events.ts', 'emit'),

    // orders
    call(
      'apps/api/services/order.service.ts',
      'createOrder',
      'apps/api/repositories/order.repository.ts',
      'save',
    ),
    call(
      'apps/api/services/order.service.ts',
      'getOrder',
      'apps/api/repositories/order.repository.ts',
      'findById',
    ),
    call(
      'apps/api/services/order.service.ts',
      'listOrders',
      'apps/api/repositories/order.repository.ts',
      'findByUser',
    ),
    call(
      'apps/api/services/order.service.ts',
      'retryPendingCheckout',
      'apps/api/services/checkout.service.ts',
      'processCheckout',
    ),
    call(
      'apps/api/services/order.service.ts',
      'markPaid',
      'apps/api/repositories/order.repository.ts',
      'save',
    ),

    // payments
    call(
      'apps/api/services/payment.service.ts',
      'processPayment',
      'apps/api/repositories/payment.repository.ts',
      'createTransaction',
      3,
    ),
    call(
      'apps/api/services/payment.service.ts',
      'processPayment',
      'lib/stripe.client.ts',
      'charge',
    ),
    call(
      'apps/api/services/payment.service.ts',
      'processPayment',
      'apps/api/services/notification.service.ts',
      'notify',
    ),
    call(
      'apps/api/services/payment.service.ts',
      'getPaymentStatus',
      'apps/api/repositories/payment.repository.ts',
      'findByTransactionId',
    ),
    call(
      'apps/api/services/payment.service.ts',
      'handleWebhook',
      'apps/api/repositories/payment.repository.ts',
      'findByTransactionId',
    ),
    call(
      'apps/api/services/payment.service.ts',
      'handleWebhook',
      'apps/api/services/order.service.ts',
      'markPaid',
    ),
    call(
      'apps/api/services/payment.service.ts',
      'createPaymentIntent',
      'apps/api/repositories/payment.repository.ts',
      'createTransaction',
    ),

    // refunds
    call(
      'apps/api/services/refund.service.ts',
      'refund',
      'apps/api/repositories/payment.repository.ts',
      'findByTransactionId',
    ),
    call('apps/api/services/refund.service.ts', 'refund', 'lib/stripe.client.ts', 'refund'),
    call(
      'apps/api/services/refund.service.ts',
      'listRefunds',
      'apps/api/repositories/payment.repository.ts',
      'findByOrder',
    ),

    // users
    call(
      'apps/api/services/user.service.ts',
      'findById',
      'apps/api/repositories/user.repository.ts',
      'findById',
    ),
    call(
      'apps/api/services/user.service.ts',
      'updateProfile',
      'apps/api/repositories/user.repository.ts',
      'findById',
    ),

    // repositories → database
    call(
      'apps/api/repositories/order.repository.ts',
      'save',
      'packages/database/database.service.ts',
      'query',
    ),
    call(
      'apps/api/repositories/order.repository.ts',
      'findById',
      'packages/database/database.service.ts',
      'query',
    ),
    call(
      'apps/api/repositories/order.repository.ts',
      'findByUser',
      'packages/database/database.service.ts',
      'query',
    ),
    call(
      'apps/api/repositories/payment.repository.ts',
      'createTransaction',
      'packages/database/database.service.ts',
      'query',
    ),
    call(
      'apps/api/repositories/payment.repository.ts',
      'findByTransactionId',
      'packages/database/database.service.ts',
      'query',
    ),
    call(
      'apps/api/repositories/payment.repository.ts',
      'findByOrder',
      'packages/database/database.service.ts',
      'query',
    ),
    call(
      'apps/api/repositories/user.repository.ts',
      'findByEmail',
      'packages/database/database.service.ts',
      'query',
    ),
    call(
      'apps/api/repositories/user.repository.ts',
      'findById',
      'packages/database/database.service.ts',
      'query',
    ),

    // database internals
    call(
      'packages/database/database.service.ts',
      'transaction',
      'packages/database/database.service.ts',
      'query',
    ),

    // stripe / token / http
    call('lib/stripe.client.ts', 'charge', 'lib/http.ts', 'post'),
    call('lib/stripe.client.ts', 'refund', 'lib/http.ts', 'post'),
    call('lib/stripe.client.ts', 'getPaymentMethod', 'lib/http.ts', 'get'),
  ];
};

/** EXTENDS: ValidationError/NotFoundError extend AppError. */
export const extendsRels = (): SeedRel[] => [
  {
    type: 'EXTENDS',
    fromLabel: 'Class',
    toLabel: 'Class',
    from: classId('packages/shared/errors.ts', 'ValidationError'),
    to: classId('packages/shared/errors.ts', 'AppError'),
  },
  {
    type: 'EXTENDS',
    fromLabel: 'Class',
    toLabel: 'Class',
    from: classId('packages/shared/errors.ts', 'NotFoundError'),
    to: classId('packages/shared/errors.ts', 'AppError'),
  },
];
