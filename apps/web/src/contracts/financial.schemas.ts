import { z } from 'zod';

const decimalStringSchema = z
  .union([
    z.string().regex(/^-?\d+(\.\d+)?$/, 'Expected decimal string'),
    z.number().finite(),
  ])
  .transform((value) => String(value));

export const dashboardVarianceItemSchema = z.object({
  line_label: z.string(),
  budgeted: decimalStringSchema,
  actual: decimalStringSchema,
  variance_pct: decimalStringSchema,
});

export const dashboardDataSchema = z.object({
  period: z.object({
    id: z.string(),
    label: z.string(),
    status: z.string(),
  }),
  kpis: z.array(
    z.object({
      kpi_id: z.string(),
      kpi_code: z.string(),
      kpi_label: z.string(),
      unit: z.string(),
      value: decimalStringSchema,
      severity: z.string(),
    }),
  ),
  alerts_unread: z.number().int().nonnegative().optional(),
  alerts: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(['CRITICAL', 'WARN', 'INFO']),
      message: z.string(),
      created_at: z.string().optional(),
    }),
  ),
  is_summary: z.object({
    revenue: decimalStringSchema,
    expenses: decimalStringSchema,
    ebitda: decimalStringSchema,
    net: decimalStringSchema,
    ebitda_margin: decimalStringSchema,
    revenue_trend: z.enum(['up', 'down', 'stable']).optional(),
    ebitda_trend: z.enum(['up', 'down', 'stable']).optional(),
    net_trend: z.enum(['up', 'down', 'stable']).optional(),
  }),
  variance_pct: z.array(dashboardVarianceItemSchema),
  runway_weeks: decimalStringSchema,
  ca_trend: z.array(
    z.object({
      period_label: z.string(),
      value: decimalStringSchema,
    }),
  ),
});

export const cashFlowWeekSchema = z.object({
  week: z.number().int().min(1),
  inflows: decimalStringSchema,
  outflows: decimalStringSchema,
});

export const cashFlowDataSchema = z.object({
  weekly: z.array(cashFlowWeekSchema),
  total_inflows: decimalStringSchema,
  total_outflows: decimalStringSchema,
  runway_weeks: z.number().nullable(),
  entries_count: z.number().int().nonnegative(),
});

export const cashFlowAnalysisTypeSchema = z.object({
  type: z.string(),
  inflows: z.number(),
  outflows: z.number(),
});

export const cashFlowAnalysisWeeklyNetSchema = z.object({
  week: z.string(),
  net: z.number(),
});

export const cashFlowAnalysisTopFlowSchema = z.object({
  label: z.string(),
  flow_type: z.string(),
  amount: z.number(),
});

export const cashFlowAnalysisRatiosSchema = z.object({
  COVERAGE: z.number(),
  BURN_RATE: z.number(),
  CASH_CONVERSION: z.number(),
  INFLOW_CONCENTRATION: z.number(),
  RUNWAY: z.number(),
  OPERATING_CF_RATIO: z.number(),
});

export const cashFlowAnalysisSchema = z.object({
  net_cash: z.number(),
  coverage_ratio: z.number(),
  runway_weeks: z.number(),
  by_type: z.array(cashFlowAnalysisTypeSchema),
  weekly_net: z.array(cashFlowAnalysisWeeklyNetSchema),
  top_inflows: z.array(cashFlowAnalysisTopFlowSchema),
  top_outflows: z.array(cashFlowAnalysisTopFlowSchema),
  ratios: cashFlowAnalysisRatiosSchema,
});

export const plannedFlowSchema = z.object({
  id: z.string(),
  planned_date: z.string().nullable(),
  flow_type: z.string(),
  direction: z.enum(['IN', 'OUT']),
  amount: decimalStringSchema,
  label: z.string(),
});

export const bankAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  bank_name: z.string().nullable(),
  account_name: z.string().nullable(),
  account_number: z.string().nullable(),
  account_type: z.enum(['BANK', 'WAVE', 'ORANGE_MONEY', 'MTN_MOMO']),
  balance: decimalStringSchema,
  current_balance: decimalStringSchema,
  currency: z.string(),
  is_active: z.boolean(),
});

export const kpiValueSchema = z.object({
  kpi_id: z.string(),
  kpi_code: z.string(),
  kpi_label: z.string(),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  unit: z.string(),
  period_id: z.string(),
  scenario_id: z.string().nullable(),
  value: decimalStringSchema,
  severity: z.string(),
  calculated_at: z.string(),
  status: z.string().optional(),
  label: z.string().optional(),
  threshold_warn: z.union([decimalStringSchema, z.number(), z.null()]).optional(),
  threshold_critical: z.union([decimalStringSchema, z.number(), z.null()]).optional(),
});

export type DashboardVarianceItem = z.infer<typeof dashboardVarianceItemSchema>;
export type DashboardData = z.infer<typeof dashboardDataSchema>;
export type CashFlowWeek = z.infer<typeof cashFlowWeekSchema>;
export type CashFlowData = z.infer<typeof cashFlowDataSchema>;
export type CashFlowAnalysis = z.infer<typeof cashFlowAnalysisSchema>;
export type PlannedFlow = z.infer<typeof plannedFlowSchema>;
export type BankAccount = z.infer<typeof bankAccountSchema>;
export type KpiValue = z.infer<typeof kpiValueSchema>;

export function parseFinancialPayload<T>(schema: z.ZodType<T>, payload: unknown, context: string): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  throw new Error(`Invalid ${context} payload: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
}
