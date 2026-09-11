import { IsUUID } from "class-validator";

export class FindOneCategoryDto {
  @IsUUID()
  categoryId!: string;
}
