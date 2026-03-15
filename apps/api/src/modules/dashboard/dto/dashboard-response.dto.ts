import { PeriodStatus } from '@prisma/client';
import { KpiValueResponseDto } from '../../kpis/dto/kpi-value-response.dto';
import { AlertResponseDto } from '../../alerts/dto/alert-response.dto';

export class DashboardResponseDto {
  period!: {
    id: string;
    label: string;
    status: PeriodStatus;
  };
  kpis!: KpiValueResponseDto[];
  alerts_unread!: number;
  alerts!: AlertResponseDto[];
  is_summary!: {
    revenue: string;
    expenses: string;
    ebitda: string;
    net: string;
    ebitda_margin: string;
  };
  variance_pct!: string;
  runway_weeks!: number;
  ca_trend!: Array<{
    period_label: string;
    value: string;
  }>;
}
