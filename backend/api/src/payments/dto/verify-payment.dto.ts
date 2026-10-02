import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class VerifyPaymentDto {
  @IsUUID()
  paymentId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  providerOrderId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  providerPaymentId: string;

  @IsString()
  @MinLength(64)
  @MaxLength(128)
  signature: string;
}
