import { IsIn, IsOptional } from 'class-validator';
import { ScenarioCalculationModeValue } from '../scenarios.repository';

export class CalculateScenarioDto {
  @IsOptional()
  @IsIn(['GLOBAL', 'COMPTES_CIBLES'])
  calculation_mode?: ScenarioCalculationModeValue;
}
