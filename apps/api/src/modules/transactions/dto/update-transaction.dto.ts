import { IsDateString, IsDecimal, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { LineType } from '@prisma/client';

export class UpdateTransactionDto {
  @IsOptional()
  @IsDateString()
  transaction_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  account_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsEnum(LineType)
  line_type?: LineType;

  @IsOptional()
  @IsDecimal()
  amount?: string;

  @IsOptional()
  @IsUUID()
  period_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
