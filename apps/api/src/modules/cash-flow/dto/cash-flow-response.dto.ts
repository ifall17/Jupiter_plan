export class CashFlowResponseDto {
  id!: string;
  period_id!: string;
  week_number!: number;
  label!: string;
  inflow!: string;
  outflow!: string;
  balance!: string;
  runway_weeks!: number | null;
  created_at!: Date;
}
