import { IsString, Length } from "class-validator";

export class SendOtpCodeDto {
  @IsString()
  @Length(10, 11)
  phone!: string;
}
