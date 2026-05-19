import { Transform, Type } from "class-transformer";
import {
  Contains,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from "class-validator";

class AddressDto {
  @IsString()
  street!: string;

  @IsString()
  number!: string;

  @IsString()
  @IsOptional()
  complement?: string;

  @IsString()
  neighborhood!: string;

  @IsString()
  zipCode!: string;
}

export class InitMeDto {
  @IsString()
  @Transform(({ value }) => value?.trim())
  @Length(4, 80)
  @Contains(" ", { message: "name must contain first and last name" })
  name!: string;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}
