import { AlertSeverity } from '@prisma/client';

export class KpiValueResponseDto {
  kpi_id!: string;
  kpi_code!: string;
  kpi_label!: string;
  category!: string | null;
  description!: string | null;
  unit!: string;
  period_id!: string;
  scenario_id!: string | null;
  value!: string;
  threshold_warn!: string | null;
  threshold_critical!: string | null;
  severity!: AlertSeverity;
  calculated_at!: Date;
}
