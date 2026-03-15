import { IsDecimal, IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateCashFlowPlanDto {
  @IsUUID()
  period_id!: string;

  @IsInt()
  @Min(1)
  @Max(52)
  week_number!: number;

  @IsString()
  @MaxLength(100)
  label!: string;

  @IsDecimal()
  inflow!: string;

  @IsDecimal()
  outflow!: string;
}
