import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectBudgetDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  rejection_comment!: string;
}
