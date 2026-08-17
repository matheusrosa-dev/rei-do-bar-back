import { IsUUID } from "class-validator";

export class FindByIdDto {
  @IsUUID()
  productId: string;
}
