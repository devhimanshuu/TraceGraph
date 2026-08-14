import { parseFile } from './repo-parser';

describe('repo-parser', () => {
  it('returns null for non-source files', () => {
    expect(parseFile('README.md', '# hi')).toBeNull();
    expect(parseFile('src/foo.d.ts', 'declare const x: number;')).toBeNull();
    expect(parseFile('package.json', '{}')).toBeNull();
  });

  it('extracts declared functions with signatures', () => {
    const parsed = parseFile(
      'src/payments.ts',
      `
export function processPayment(amount: number, retries: number): boolean {
  return amount > 0;
}
`,
    );
    expect(parsed?.symbols).toHaveLength(1);
    expect(parsed?.symbols[0]).toMatchObject({
      name: 'processPayment',
      kind: 'function',
      signature: 'processPayment(amount, retries)',
      visibility: 'public',
    });
  });

  it('extracts const arrow functions', () => {
    const parsed = parseFile(
      'src/util.ts',
      `
export const formatDate = (iso: string): string => iso.slice(0, 10);
`,
    );
    expect(parsed?.symbols).toHaveLength(1);
    expect(parsed?.symbols[0]).toMatchObject({
      name: 'formatDate',
      kind: 'function',
      signature: 'formatDate(iso)',
    });
  });

  it('extracts classes and their methods with visibility', () => {
    const parsed = parseFile(
      'src/payment.service.ts',
      `
export class PaymentService {
  private static instance: PaymentService;
  constructor() {}
  public processPayment(amount: number): string {
    return 'ok';
  }
  protected retry(): void {}
}
`,
    );
    const classes = parsed?.symbols.filter((s) => s.kind === 'class') ?? [];
    const methods = parsed?.symbols.filter((s) => s.kind === 'method') ?? [];
    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('PaymentService');
    expect(methods).toHaveLength(2);
    expect(methods[0]).toMatchObject({
      name: 'PaymentService.processPayment',
      className: 'PaymentService',
      visibility: 'public',
      signature: 'processPayment(amount)',
    });
    expect(methods[1].visibility).toBe('protected');
  });

  it('records imports (default, named, namespace)', () => {
    const parsed = parseFile(
      'src/app.ts',
      `
import DefaultThing from './thing';
import { a as b, c } from '../lib/mix';
import * as ns from './namespace';
`,
    );
    expect(parsed?.imports).toHaveLength(3);
    expect(parsed?.imports[0]).toMatchObject({ specifier: './thing', defaultLocal: 'DefaultThing' });
    expect(parsed?.imports[1].imported).toEqual([
      { local: 'b', remote: 'a' },
      { local: 'c', remote: 'c' },
    ]);
    expect(parsed?.imports[2].namespace).toBe('ns');
  });

  it('attaches the enclosing caller to call expressions', () => {
    const parsed = parseFile(
      'src/order.ts',
      `
export function placeOrder(): void {
  charge();
  helper.track();
}
function charge(): void {}
`,
    );
    const calls = parsed?.calls ?? [];
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ caller: 'placeOrder', callee: 'charge' });
    expect(calls[1]).toMatchObject({ caller: 'placeOrder', callee: 'helper.track' });
  });

  it('scopes method calls to the enclosing class method', () => {
    const parsed = parseFile(
      'src/checkout.service.ts',
      `
export class CheckoutService {
  run(): void {
    this.validate();
  }
  private validate(): void {}
}
`,
    );
    expect(parsed?.calls[0]).toMatchObject({
      caller: 'CheckoutService.run',
      callee: 'this.validate',
    });
  });

  it('records extends clauses', () => {
    const parsed = parseFile(
      'src/base.ts',
      `
export class BaseStore {}
export class CacheStore extends BaseStore {}
`,
    );
    expect(parsed?.extends).toEqual([{ className: 'CacheStore', parent: 'BaseStore' }]);
  });

  it('detects describe/it test chains', () => {
    const parsed = parseFile(
      'src/checkout.spec.ts',
      `
describe('checkout', () => {
  it('charges the card once', () => {
    expect(1).toBe(1);
  });
});
`,
    );
    expect(parsed?.tests).toEqual([{ name: 'checkout › charges the card once' }]);
  });
});
