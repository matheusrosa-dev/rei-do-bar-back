import { IsUUID } from "class-validator";

export class DeleteCategoryGroupDto {
  @IsUUID()
  categoryGroupId!: string;
}
