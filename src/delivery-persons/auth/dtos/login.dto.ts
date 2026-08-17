import { IsString, Length, Matches } from "class-validator";

export class LoginDto {
  @IsString()
  @Length(11, 11)
  @Matches(/^\d+$/)
  cpf!: string;

  @IsString()
  @Length(8, 72)
  password!: string;
}
