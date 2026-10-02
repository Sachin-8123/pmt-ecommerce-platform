import { Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateLocationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speed?: number;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class SocketLocationUpdateDto extends UpdateLocationDto {
  @IsString()
  @IsNotEmpty()
  deliveryId: string;
}

export class JoinDeliveryDto {
  @IsString()
  @IsNotEmpty()
  deliveryId: string;
}

export class LeaveDeliveryDto {
  @IsString()
  @IsNotEmpty()
  deliveryId: string;
}

