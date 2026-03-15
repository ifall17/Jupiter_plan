import { AlertSeverity } from '@prisma/client';

export class AlertResponseDto {
  id!: string;
  kpi_id!: string;
  kpi_code!: string;
  kpi_label!: string;
  period_id!: string;
  severity!: AlertSeverity;
  message!: string;
  is_read!: boolean;
  created_at!: Date;
}
