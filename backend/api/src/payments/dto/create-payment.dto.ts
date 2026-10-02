import { IsEnum, IsUUID } from 'class-validator';

export enum PaymentMethod {
  ONLINE = 'ONLINE',
  COD = 'COD',
}

export class CreatePaymentDto {
  @IsUUID()
  orderId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
