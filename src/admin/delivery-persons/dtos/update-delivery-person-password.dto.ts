import { IsString, IsUUID, Length } from "class-validator";

export class UpdateDeliveryPersonPasswordBodyDto {
  @IsString()
  @Length(8, 72)
  password!: string;
}

export class UpdateDeliveryPersonPasswordParamsDto {
  @IsUUID()
  deliveryPersonId!: string;
}
