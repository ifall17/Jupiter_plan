import { IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCashFlowPlanDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;

  @IsDecimal()
  @IsOptional()
  inflow?: string;

  @IsDecimal()
  @IsOptional()
  outflow?: string;
}
