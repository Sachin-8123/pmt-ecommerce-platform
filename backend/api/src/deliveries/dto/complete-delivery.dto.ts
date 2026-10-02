import { IsBoolean, IsIn } from 'class-validator';

export class CompleteDeliveryDto {
  @IsBoolean()
  @IsIn([true])
  confirmation: boolean;
}
