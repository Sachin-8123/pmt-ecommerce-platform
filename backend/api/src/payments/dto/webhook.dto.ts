import { IsEnum, IsNumber, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentWebhookType {
  SUCCESS = 'payment.success',
  FAILED = 'payment.failed',
}

export class PaymentWebhookDto {
  @IsUUID()
  eventId: string;

  @IsEnum(PaymentWebhookType)
  eventType: PaymentWebhookType;

  @IsString()
  @MaxLength(200)
  providerOrderId: string;

  @IsString()
  @MaxLength(200)
  providerPaymentId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsString()
  @MaxLength(10)
  currency: string;
}
