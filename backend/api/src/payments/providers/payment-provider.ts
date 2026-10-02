export interface CreateProviderPaymentInput {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
}

export interface ProviderPaymentOrder {
  providerOrderId: string;
}

export interface VerifyProviderPaymentInput {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
  amount: number;
  currency: string;
}

export interface ProviderWebhookInput {
  eventId: string;
  eventType: string;
  providerOrderId: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  signature: string;
}

export interface PaymentProvider {
  readonly name: string;
  createPaymentOrder(input: CreateProviderPaymentInput): Promise<ProviderPaymentOrder>;
  verifyPayment(input: VerifyProviderPaymentInput): Promise<boolean>;
  verifyWebhook(input: ProviderWebhookInput): Promise<boolean>;
}
