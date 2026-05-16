import { IsUUID } from "class-validator";

export class RemoveAddressDto {
  @IsUUID()
  addressId!: string;
}
