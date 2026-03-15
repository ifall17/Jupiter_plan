import {
  IsArray,
  IsDecimal,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LineType } from '@prisma/client';

export class BudgetLineDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsUUID()
  period_id!: string;

  @IsString()
  @Matches(/^\d{6,8}$/)
  account_code!: string;

  @IsString()
  @MaxLength(200)
  account_label!: string;

  @IsString()
  @MaxLength(100)
  department!: string;

  @IsEnum(LineType)
  line_type!: LineType;

  @IsDecimal()
  amount_budget!: string;
}

export class UpdateBudgetLineDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines!: BudgetLineDto[];
}
