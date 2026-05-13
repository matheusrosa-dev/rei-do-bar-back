import { IsString, Length } from "class-validator";

export class SendVerificationCodeDto {
  @IsString()
  @Length(10, 11)
  phone!: string;
}
