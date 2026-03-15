import { BudgetStatus, LineType } from '@prisma/client';

export class BudgetLineResponseDto {
  id!: string;
  period_id!: string;
  account_code!: string;
  account_label!: string;
  department!: string;
  line_type!: LineType;
  amount_budget!: string;
  amount_actual!: string;
  variance!: string;
}

export class BudgetResponseDto {
  id!: string;
  name!: string;
  status!: BudgetStatus;
  version!: number;
  fiscal_year_id!: string;
  submitted_at!: Date | null;
  submitted_by!: string | null;
  approved_at!: Date | null;
  approved_by!: string | null;
  locked_at!: Date | null;
  rejection_comment!: string | null;
  lines!: BudgetLineResponseDto[];
  created_at!: Date;
}
