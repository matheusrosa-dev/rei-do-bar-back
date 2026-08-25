import { Type } from "class-transformer";
import { IsDate, IsOptional } from "class-validator";

export class FindDeliveryPersonsPerformanceDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
