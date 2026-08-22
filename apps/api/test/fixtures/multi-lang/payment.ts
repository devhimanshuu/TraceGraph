// @ts-nocheck
import { Logger } from './utils';
import { PaymentGateway } from './gateway';

export interface PaymentConfig {
  apiKey: string;
  timeout: number;
}

export class PaymentService {
  private logger: Logger;

  constructor(private config: PaymentConfig) {
    this.logger = new Logger('PaymentService');
  }

  async processPayment(amount: number, currency: string): Promise<boolean> {
    this.logger.info(`Processing ${amount} ${currency}`);
    const gateway = new PaymentGateway(this.config.apiKey);
    return gateway.charge(amount, currency);
  }

  refund(transactionId: string): void {
    this.logger.info(`Refunding ${transactionId}`);
  }
}

export function calculateTax(amount: number, rate: number): number {
  return amount * rate;
}
