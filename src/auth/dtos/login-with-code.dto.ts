import { IsString, Length, Matches } from "class-validator";

export class LoginWithCodeDto {
  @IsString()
  @Length(10, 11)
  phone!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[A-Z0-9]{6}$/)
  code!: string;
}
