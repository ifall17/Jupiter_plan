import { AlertSeverity } from '@prisma/client';

export class KpiValueResponseDto {
  kpi_id!: string;
  kpi_code!: string;
  kpi_label!: string;
  unit!: string;
  period_id!: string;
  scenario_id!: string | null;
  value!: string;
  severity!: AlertSeverity;
  calculated_at!: Date;
}
