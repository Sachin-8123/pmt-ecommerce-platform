import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10,15}$/, { message: 'phone must contain 10 to 15 digits' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(250)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,10}$/, { message: 'pincode must contain 4 to 10 digits' })
  pincode?: string;
}
