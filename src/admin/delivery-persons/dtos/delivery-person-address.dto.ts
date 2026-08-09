import { IsString, Length, Matches } from "class-validator";

export class DeliveryPersonAddressDto {
  @IsString()
  @Length(1, 100)
  street!: string;

  @IsString()
  @Length(1, 10)
  number!: string;

  @IsString()
  @Length(1, 100)
  neighborhood!: string;

  @IsString()
  @Length(8, 8)
  @Matches(/^\d+$/)
  zipCode!: string;
}
