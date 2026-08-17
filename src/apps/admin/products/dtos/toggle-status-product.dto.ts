import { IsUUID } from "class-validator";

export class ToggleStatusProductDto {
  @IsUUID()
  productId: string;
}
