import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CreateProviderPaymentInput,
  PaymentProvider,
  ProviderPaymentOrder,
  ProviderWebhookInput,
  VerifyProviderPaymentInput,
} from './payment-provider';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async createPaymentOrder(input: CreateProviderPaymentInput): Promise<ProviderPaymentOrder> {
    return { providerOrderId: `mock_order_${input.paymentId}` };
  }

  async verifyPayment(input: VerifyProviderPaymentInput): Promise<boolean> {
    const expected = this.sign(
      `${input.providerOrderId}|${input.providerPaymentId}|${input.amount.toFixed(2)}|${input.currency}`,
    );
    return this.matches(expected, input.signature);
  }

  async verifyWebhook(input: ProviderWebhookInput): Promise<boolean> {
    const expected = this.sign(
      `${input.eventId}|${input.eventType}|${input.providerOrderId}|${input.providerPaymentId}|${input.amount.toFixed(2)}|${input.currency}`,
    );
    return this.matches(expected, input.signature);
  }

  private sign(value: string) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('Payment provider is not configured');
    }
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  private matches(expected: string, received: string) {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(received || '', 'utf8');
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  }
}
