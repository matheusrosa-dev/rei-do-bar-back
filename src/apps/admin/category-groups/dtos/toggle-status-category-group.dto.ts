import { IsUUID } from "class-validator";

export class ToggleStatusCategoryGroupDto {
  @IsUUID()
  categoryGroupId!: string;
}
