import { IsDecimal, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateBankAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bank_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  account_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  account_number?: string;

  @IsOptional()
  @IsEnum(AccountType)
  account_type?: AccountType;

  @IsOptional()
  @IsDecimal()
  balance?: string;

  @IsOptional()
  @IsDecimal()
  current_balance?: string;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;
}
