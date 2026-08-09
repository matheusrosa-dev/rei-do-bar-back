import { OrderStatus } from "@shared/database/prisma/generated/enums";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from "class-validator";

export class UpdateOrderStatusParamsDto {
  @IsUUID()
  orderId!: string;
}

export class UpdateOrderStatusBodyDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ValidateIf(
    (dto: UpdateOrderStatusBodyDto) => dto.status === OrderStatus.SHIPPED,
  )
  @IsUUID()
  deliveryPersonId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  statusReason?: string;
}
