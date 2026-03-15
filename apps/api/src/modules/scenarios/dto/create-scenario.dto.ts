import { IsEnum, IsString, IsUUID, MaxLength } from 'class-validator';
import { ScenarioType } from '@prisma/client';

export class CreateScenarioDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsEnum(ScenarioType)
  type!: ScenarioType;

  @IsUUID()
  budget_id!: string;
}
