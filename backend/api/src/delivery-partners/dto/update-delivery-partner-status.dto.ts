import { IsEnum } from 'class-validator';

export enum DeliveryPartnerStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
  INACTIVE = 'INACTIVE',
}

export class UpdateDeliveryPartnerStatusDto {
  @IsEnum(DeliveryPartnerStatus)
  status: DeliveryPartnerStatus;
}
