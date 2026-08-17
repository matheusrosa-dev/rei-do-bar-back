import { IsOptional, IsString, Length, Matches } from "class-validator";

export class UpdateAddressDto {
  @IsString()
  @Length(8, 8)
  @Matches(/^\d+$/)
  zipCode!: string;

  @IsString()
  @Length(1, 100)
  neighborhood!: string;

  @IsString()
  @Length(1, 10)
  number!: string;

  @IsString()
  @Length(1, 100)
  street!: string;

  @IsOptional()
  @IsString()
  @Length(5, 255)
  complement?: string;
}
