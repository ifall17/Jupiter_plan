import { IsArray, IsDecimal, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class HypothesisDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  @IsString()
  @MaxLength(100)
  parameter!: string;

  @IsDecimal()
  value!: string;

  @IsIn(['%', 'FCFA', 'multiplier', 'jours'])
  unit!: '%' | 'FCFA' | 'multiplier' | 'jours';
}

export class AddHypothesisDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HypothesisDto)
  hypotheses!: HypothesisDto[];
}
