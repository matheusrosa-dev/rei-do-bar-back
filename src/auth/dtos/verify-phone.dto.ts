import { IsString, Length } from "class-validator";

export class VerifyPhoneDto {
  @IsString()
  @Length(10, 11)
  phone!: string;
}
