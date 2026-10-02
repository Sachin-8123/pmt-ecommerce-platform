import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDeliveryPartnerDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleNumber?: string;
}
