import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class CoordinatePairDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  originLatitude: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  originLongitude: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  destinationLatitude: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  destinationLongitude: number;
}
