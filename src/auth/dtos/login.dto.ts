import { IsPhoneNumber, IsString, IsUUID } from "class-validator";

export class LoginDto {
  @IsUUID()
  deviceId!: string;

  @IsString()
  name!: string;

  @IsPhoneNumber("BR")
  phoneNumber!: string;
}
