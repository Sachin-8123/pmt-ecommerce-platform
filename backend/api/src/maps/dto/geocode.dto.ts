import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GeocodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;
}
