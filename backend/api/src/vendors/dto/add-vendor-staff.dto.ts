import { IsEnum, IsUUID } from 'class-validator';
import { VendorStaffRole } from '@prisma/client';

export class AddVendorStaffDto {
  @IsUUID()
  userId: string;

  @IsEnum(VendorStaffRole)
  role: VendorStaffRole;
}
