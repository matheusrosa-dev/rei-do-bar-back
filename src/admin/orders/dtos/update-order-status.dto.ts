import { OrderStatus } from "@shared/database/prisma/generated/enums";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class UpdateOrderStatusParamsDto {
  @IsUUID()
  orderId: string;
}

export class UpdateOrderStatusBodyDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  statusReason?: string;
}
