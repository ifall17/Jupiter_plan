import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class GenerateReportDto {
  @IsString()
  @IsIn(['pl', 'balance_sheet', 'cash_flow', 'budget_variance', 'transactions', 'kpis'])
  report_type!: string;

  @IsString()
  @IsIn(['pdf', 'excel'])
  format!: 'pdf' | 'excel';

  @IsOptional()
  @IsUUID()
  period_id?: string;

  @IsOptional()
  @IsBoolean()
  ytd?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  quarter?: number;

  @IsOptional()
  @IsUUID()
  from_period?: string;

  @IsOptional()
  @IsUUID()
  to_period?: string;
}
