import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum StockAdjustmentType {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
  SET = 'SET',
}

export class AdjustStockDto {
  @IsEnum(StockAdjustmentType)
  type: StockAdjustmentType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity: number;
}
