import { IsUUID } from "class-validator";

export class FindOneCategoryGroupDto {
  @IsUUID()
  categoryGroupId!: string;
}
