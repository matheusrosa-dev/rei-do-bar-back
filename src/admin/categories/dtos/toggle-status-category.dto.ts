import { IsUUID } from "class-validator";

export class ToggleStatusCategoryDto {
  @IsUUID()
  categoryId: string;
}
