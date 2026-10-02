import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateVendorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  businessName: string;

  @IsString()
  @Matches(/^\d{10,15}$/, { message: 'phone must contain 10 to 15 digits' })
  phone: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,10}$/, { message: 'pincode must contain 4 to 10 digits' })
  pincode?: string;
}
