import { ScenarioStatus, ScenarioType } from '@prisma/client';

export class HypothesisResponseDto {
  id!: string;
  label!: string;
  parameter!: string;
  value!: string;
  unit!: string;
}

export class FinancialSnapshotDto {
  id!: string;
  period_id!: string;
  is_revenue!: string;
  is_expenses!: string;
  is_ebitda!: string;
  is_net!: string;
  bs_assets!: string;
  bs_liabilities!: string;
  bs_equity!: string;
  cf_operating!: string;
  cf_investing!: string;
  cf_financing!: string;
  calculated_at!: Date;
}

export class ScenarioResponseDto {
  id!: string;
  name!: string;
  type!: ScenarioType;
  status!: ScenarioStatus;
  budget_id!: string;
  hypotheses!: HypothesisResponseDto[] | null;
  snapshot!: FinancialSnapshotDto | null;
  created_at!: Date;
}
