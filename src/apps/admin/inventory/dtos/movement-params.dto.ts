import { IsUUID } from "class-validator";

export class MovementParamsDto {
  @IsUUID()
  movementId!: string;
}
