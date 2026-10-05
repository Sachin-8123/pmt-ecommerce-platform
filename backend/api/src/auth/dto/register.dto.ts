import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsIn(['CUSTOMER', 'VENDOR', 'DELIVERY_PARTNER', 'STAFF', 'ADMIN'])
  role?: 'CUSTOMER' | 'VENDOR' | 'DELIVERY_PARTNER' | 'STAFF' | 'ADMIN';

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @Matches(/^\d{10,15}$/, { message: 'phone must contain 10 to 15 digits' })
  phone: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ValidateIf((dto: RegisterDto) => dto.role === 'VENDOR')
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleNumber?: string;
}