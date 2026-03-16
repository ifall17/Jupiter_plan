import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBudgetDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsUUID()
  fiscal_year_id!: string;

  @IsOptional()
  @IsUUID()
  parent_budget_id?: string;
}
