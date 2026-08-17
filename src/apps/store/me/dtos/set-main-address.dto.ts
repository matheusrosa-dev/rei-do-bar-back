import { IsUUID } from "class-validator";

export class SetMainAddressDto {
  @IsUUID()
  addressId!: string;
}
