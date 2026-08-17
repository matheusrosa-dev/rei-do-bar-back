import { Type } from "class-transformer";
import {
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";
import { DeliveryPersonAddressDto } from "./delivery-person-address.dto";

export class UpdateDeliveryPersonBodyDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Length(11, 11)
  @Matches(/^\d+$/)
  phone!: string;

  @IsString()
  @Length(11, 11)
  @Matches(/^\d+$/)
  cpf!: string;

  @Type(() => DeliveryPersonAddressDto)
  @ValidateNested()
  address!: DeliveryPersonAddressDto;
}

export class UpdateDeliveryPersonParamsDto {
  @IsUUID()
  deliveryPersonId!: string;
}
