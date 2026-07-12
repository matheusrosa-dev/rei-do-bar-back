import { Transform, Type } from "class-transformer";
import {
  Contains,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";

class AddressDto {
  @IsString()
  @Length(1, 100)
  street!: string;

  @IsString()
  @Length(1, 10)
  number!: string;

  @IsOptional()
  @IsString()
  @Length(5, 255)
  complement?: string;

  @IsString()
  @Length(1, 100)
  neighborhood!: string;

  @IsString()
  @Length(8, 8)
  @Matches(/^\d+$/)
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
