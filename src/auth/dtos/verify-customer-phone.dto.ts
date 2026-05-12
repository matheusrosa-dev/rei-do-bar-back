import { IsString, Length } from "class-validator";

export class VerifyCustomerPhoneDto {
  @IsString()
  @Length(10, 11)
  phone!: string;
}
