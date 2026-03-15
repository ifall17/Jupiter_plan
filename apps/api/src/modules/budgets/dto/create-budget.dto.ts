import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBudgetDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsUUID()
  fiscal_year_id!: string;
}
