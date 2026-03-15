import { IsDecimal, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateBankAccountDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(AccountType)
  account_type!: AccountType;

  @IsDecimal()
  balance!: string;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;
}
