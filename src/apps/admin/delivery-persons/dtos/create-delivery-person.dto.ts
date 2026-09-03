import { IsString, Length, Matches } from "class-validator";

export class CreateDeliveryPersonDto {
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
}
