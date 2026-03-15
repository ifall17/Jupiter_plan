import { IsDateString, IsDecimal, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { LineType } from '@prisma/client';

export class CreateTransactionDto {
  @IsDateString()
  transaction_date!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  account_code!: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsString()
  @MaxLength(100)
  department!: string;

  @IsEnum(LineType)
  line_type!: LineType;

  @IsDecimal()
  amount!: string;

  @IsUUID()
  period_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
