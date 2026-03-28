import { Injectable } from '@nestjs/common';
import { BudgetStatus, LineType, Prisma, ScenarioCalculationMode, ScenarioStatus, ScenarioType } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { PrismaService } from '../../prisma/prisma.service';

export type ScenarioCalculationModeValue = 'GLOBAL' | 'COMPTES_CIBLES';

const TARGETED_HYPOTHESIS_MAP: Record<
  string,
  {
    lineTypes?: LineType[];
    prefixes?: string[];
    inverse?: boolean;
  }
> = {
  revenue_growth: { lineTypes: [LineType.REVENUE] },
  export_growth: { lineTypes: [LineType.REVENUE], prefixes: ['7012', '7013', '7014'] },
  cost_reduction: { lineTypes: [LineType.EXPENSE], prefixes: ['601', '602', '604', '605'], inverse: true },
  payroll_increase: {
    lineTypes: [LineType.EXPENSE],
    prefixes: ['621', '622', '641', '642', '643', '644', '645', '646'],
  },
  defect_rate: { lineTypes: [LineType.EXPENSE], prefixes: ['601', '602', '604'] },
  capex_increase: { lineTypes: [LineType.CAPEX], prefixes: ['215', '218', '241', '244', '245', '246', '247', '248'] },
  marketing_increase: { lineTypes: [LineType.EXPENSE], prefixes: ['623', '624'] },
  overhead_reduction: { lineTypes: [LineType.EXPENSE], prefixes: ['625', '626', '627', '628'], inverse: true },
};

export type RepoScenario = {
  id: string;
  org_id: string;
  budget_id: string;
  name: string;
  type: ScenarioType;
  status: ScenarioStatus;
  calculation_mode: ScenarioCalculationMode;
  created_at: Date;
  hypotheses: Array<{
    id: string;
    label: string;
    parameter: string;
    value: Prisma.Decimal;
    unit: string;
  }>;
  snapshots: Array<{
    id: string;
    period_id: string;
    is_revenue: Prisma.Decimal;
    is_expenses: Prisma.Decimal;
    is_ebitda: Prisma.Decimal;
    is_net: Prisma.Decimal;
    bs_assets: Prisma.Decimal;
    bs_liabilities: Prisma.Decimal;
    bs_equity: Prisma.Decimal;
    cf_operating: Prisma.Decimal;
    cf_investing: Prisma.Decimal;
    cf_financing: Prisma.Decimal;
    calculated_at: Date;
  }>;
};

@Injectable()
export class ScenariosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPaginated(params: {
    org_id: string;
    role: UserRole;
    status?: ScenarioStatus;
    fiscal_year_id?: string;
    skip: number;
    take: number;
  }): Promise<{ items: RepoScenario[]; total: number }> {
    const where: Prisma.ScenarioWhereInput = { org_id: params.org_id };

    if (params.role === UserRole.LECTEUR) {
      where.status = ScenarioStatus.SAVED;
    } else if (params.status) {
      where.status = params.status;
    }

    if (params.fiscal_year_id) {
      where.budget = { fiscal_year_id: params.fiscal_year_id };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.scenario.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { created_at: 'desc' },
        include: {
          hypotheses: true,
          snapshots: {
            orderBy: { calculated_at: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.scenario.count({ where }),
    ]);

    return { items, total };
  }

  async findByIdInOrg(id: string, orgId: string, role: UserRole): Promise<RepoScenario | null> {
    return this.prisma.scenario.findFirst({
      where: {
        id,
        org_id: orgId,
        ...(role === UserRole.LECTEUR ? { status: ScenarioStatus.SAVED } : {}),
      },
      include: {
        hypotheses: true,
        snapshots: {
          orderBy: { calculated_at: 'desc' },
          take: 1,
        },
      },
    });
  }

  async createScenario(data: {
    org_id: string;
    budget_id: string;
    name: string;
    type: ScenarioType;
    created_by: string;
    calculation_mode?: ScenarioCalculationModeValue;
  }): Promise<RepoScenario> {
    return this.prisma.scenario.create({
      data: {
        org_id: data.org_id,
        budget_id: data.budget_id,
        name: data.name,
        type: data.type,
        calculation_mode: data.calculation_mode ?? 'GLOBAL',
        status: ScenarioStatus.DRAFT,
        created_by: data.created_by,
      },
      include: {
        hypotheses: true,
        snapshots: {
          orderBy: { calculated_at: 'desc' },
          take: 1,
        },
      },
    });
  }

  async isBudgetApproved(budgetId: string, orgId: string): Promise<boolean> {
    const budget = await this.prisma.budget.findFirst({
      where: { id: budgetId, org_id: orgId },
      select: { status: true },
    });

    return budget?.status === BudgetStatus.APPROVED || budget?.status === BudgetStatus.LOCKED;
  }

  async replaceHypotheses(scenarioId: string, orgId: string, hypotheses: Array<{
    label: string;
    parameter: string;
    value: string;
    unit: string;
  }>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.scenarioHypothesis.deleteMany({ where: { scenario_id: scenarioId } });

      if (hypotheses.length === 0) {
        return;
      }

      await tx.scenarioHypothesis.createMany({
        data: hypotheses.map((hypothesis) => ({
          scenario_id: scenarioId,
          label: hypothesis.label,
          parameter: hypothesis.parameter,
          value: new Prisma.Decimal(hypothesis.value),
          unit: hypothesis.unit,
        })),
      });
    });
  }

  async updateStatus(scenarioId: string, orgId: string, status: ScenarioStatus): Promise<void> {
    await this.prisma.scenario.updateMany({
      where: { id: scenarioId, org_id: orgId },
      data: {
        status,
        ...(status === ScenarioStatus.CALCULATED ? { calculated_at: new Date() } : {}),
        ...(status === ScenarioStatus.SAVED ? { saved_at: new Date() } : {}),
      },
    });
  }

  async updateCalculationMode(
    scenarioId: string,
    orgId: string,
    calculationMode: ScenarioCalculationModeValue,
  ): Promise<void> {
    await this.prisma.scenario.updateMany({
      where: { id: scenarioId, org_id: orgId },
      data: { calculation_mode: calculationMode },
    });
  }

  async calculateSnapshotFromBudget(params: {
    scenarioId: string;
    orgId: string;
    budgetId: string;
    hypotheses: Array<{ parameter: string; value: string; unit: string }>;
    calculationMode?: ScenarioCalculationModeValue;
  }): Promise<{
    period_id: string;
    is_revenue: Prisma.Decimal;
    is_expenses: Prisma.Decimal;
    is_ebitda: Prisma.Decimal;
    is_net: Prisma.Decimal;
    bs_assets: Prisma.Decimal;
    bs_liabilities: Prisma.Decimal;
    bs_equity: Prisma.Decimal;
    cf_operating: Prisma.Decimal;
    cf_investing: Prisma.Decimal;
    cf_financing: Prisma.Decimal;
  }> {
    const lines = await this.prisma.budgetLine.findMany({
      where: { budget_id: params.budgetId, org_id: params.orgId },
      select: { period_id: true, line_type: true, amount_budget: true, account_code: true },
      orderBy: { period_id: 'asc' },
    });

    if (lines.length === 0) {
      throw new Error('No budget lines found to calculate scenario');
    }

    const periodId = lines[0].period_id;
  const calculationMode = params.calculationMode ?? 'GLOBAL';

    let revenue = lines
      .filter((line) => line.line_type === LineType.REVENUE)
      .reduce((sum, line) => sum.plus(line.amount_budget), new Prisma.Decimal('0'));
    let expenses = lines
      .filter((line) => line.line_type === LineType.EXPENSE)
      .reduce((sum, line) => sum.plus(line.amount_budget), new Prisma.Decimal('0'));
    let capex = lines
      .filter((line) => line.line_type === LineType.CAPEX)
      .reduce((sum, line) => sum.plus(line.amount_budget), new Prisma.Decimal('0'));
    let receivablesDelta = new Prisma.Decimal('0');
    let payablesDelta = new Prisma.Decimal('0');
    const hundred = new Prisma.Decimal('100');
    const thirty = new Prisma.Decimal('30');
    const zero = new Prisma.Decimal('0');

    // Snapshot des valeurs de base avant application des hypothèses
    const baseRevenue = revenue;
    const baseExpenses = expenses;
    const baseCapex = capex;

    // Accumulateurs de taux (additifs, sans effet cascade entre hypothèses)
    let revenuePctChange = new Prisma.Decimal('0');
    let revenueDelta = new Prisma.Decimal('0');
    let expensePctChange = new Prisma.Decimal('0');
    let expenseDelta = new Prisma.Decimal('0');
    let capexDelta = new Prisma.Decimal('0');
    // DSO/DPO traités après calcul final revenue/expenses
    const dsoDpoBatch: Array<{ param: string; value: Prisma.Decimal; unit: string }> = [];
    if (calculationMode === 'GLOBAL') {
      for (const hypothesis of params.hypotheses) {
        const param = hypothesis.parameter.trim().toLowerCase();
        let value: Prisma.Decimal;
        try {
          value = new Prisma.Decimal(hypothesis.value);
        } catch {
          continue;
        }

        if (param === 'revenue_growth' || param === 'export_growth') {
          if (hypothesis.unit === '%') {
            revenuePctChange = revenuePctChange.plus(value);
          } else if (hypothesis.unit === 'FCFA') {
            revenueDelta = revenueDelta.plus(value);
          } else if (hypothesis.unit === 'multiplier') {
            // Convertir le multiplicateur en taux équivalent : (m - 1) × 100
            revenuePctChange = revenuePctChange.plus(
              value.minus(new Prisma.Decimal('1')).mul(hundred),
            );
          }
        } else if (param === 'cost_reduction') {
          if (hypothesis.unit === '%') {
            expensePctChange = expensePctChange.minus(value);
          } else if (hypothesis.unit === 'FCFA') {
            expenseDelta = expenseDelta.minus(value);
          } else if (hypothesis.unit === 'multiplier') {
            expensePctChange = expensePctChange.minus(
              new Prisma.Decimal('1').minus(value).mul(hundred),
            );
          }
        } else if (param === 'payroll_increase' || param === 'defect_rate') {
          if (hypothesis.unit === '%') {
            expensePctChange = expensePctChange.plus(value);
          } else if (hypothesis.unit === 'FCFA') {
            expenseDelta = expenseDelta.plus(value);
          }
        } else if (param === 'capex_increase') {
          if (hypothesis.unit === '%') {
            capexDelta = capexDelta.plus(baseCapex.mul(value).div(hundred));
          } else if (hypothesis.unit === 'FCFA') {
            capexDelta = capexDelta.plus(value);
          }
        } else if (param === 'dso_change' || param === 'dpo_change') {
          dsoDpoBatch.push({ param, value, unit: hypothesis.unit });
        }
      }

      // Application simultanée de tous les taux sur la BASE (aucun effet cascade)
      revenue = baseRevenue
        .mul(new Prisma.Decimal('1').plus(revenuePctChange.div(hundred)))
        .plus(revenueDelta);

      const netExpenseFactor = new Prisma.Decimal('1').plus(expensePctChange.div(hundred));
      expenses = baseExpenses
        .mul(netExpenseFactor.lt(zero) ? zero : netExpenseFactor)
        .plus(expenseDelta);
      if (expenses.lt(zero)) expenses = zero;

      capex = baseCapex.plus(capexDelta);
    } else {
      const adjustedLines = lines.map((line) => ({
        ...line,
        amount_budget: new Prisma.Decimal(line.amount_budget),
      }));

      const lineMatchesTarget = (
        line: { line_type: LineType; account_code: string },
        target: { lineTypes?: LineType[]; prefixes?: string[] },
      ) => {
        if (target.lineTypes?.length && !target.lineTypes.includes(line.line_type)) {
          return false;
        }
        if (target.prefixes?.length) {
          return target.prefixes.some((prefix) => line.account_code.startsWith(prefix));
        }
        return true;
      };

      for (const hypothesis of params.hypotheses) {
        const param = hypothesis.parameter.trim().toLowerCase();
        let value: Prisma.Decimal;
        try {
          value = new Prisma.Decimal(hypothesis.value);
        } catch {
          continue;
        }

        if (param === 'dso_change' || param === 'dpo_change') {
          dsoDpoBatch.push({ param, value, unit: hypothesis.unit });
          continue;
        }

        const target = TARGETED_HYPOTHESIS_MAP[param];
        if (!target) {
          continue;
        }

        for (const line of adjustedLines) {
          if (!lineMatchesTarget(line, target)) {
            continue;
          }

          const current = line.amount_budget;
          let next = current;

          if (hypothesis.unit === '%') {
            const factor = value.div(hundred);
            next = target.inverse
              ? current.mul(new Prisma.Decimal('1').minus(factor))
              : current.mul(new Prisma.Decimal('1').plus(factor));
          } else if (hypothesis.unit === 'FCFA') {
            next = target.inverse ? current.minus(value) : current.plus(value);
          } else if (hypothesis.unit === 'multiplier') {
            next = current.mul(value);
          }

          line.amount_budget = next.lt(zero) ? zero : next;
        }
      }

      revenue = adjustedLines
        .filter((line) => line.line_type === LineType.REVENUE)
        .reduce((sum, line) => sum.plus(line.amount_budget), new Prisma.Decimal('0'));
      expenses = adjustedLines
        .filter((line) => line.line_type === LineType.EXPENSE)
        .reduce((sum, line) => sum.plus(line.amount_budget), new Prisma.Decimal('0'));
      capex = adjustedLines
        .filter((line) => line.line_type === LineType.CAPEX)
        .reduce((sum, line) => sum.plus(line.amount_budget), new Prisma.Decimal('0'));
    }

    // DSO / DPO calculés sur les valeurs finales projetées
    for (const h of dsoDpoBatch) {
      if (h.param === 'dso_change' && h.unit === 'jours') {
        receivablesDelta = receivablesDelta.plus(revenue.div(thirty).mul(h.value));
      }
      if (h.param === 'dpo_change' && h.unit === 'jours') {
        payablesDelta = payablesDelta.plus(expenses.div(thirty).mul(h.value));
      }
    }

    const ebitda = revenue.minus(expenses);
    // IS (Impôt sur Sociétés) — taux 20 % sur EBITDA positif ; CAPEX en CF investing
    const IS_RATE = new Prisma.Decimal('0.20');
    const isTax = ebitda.gt(zero) ? ebitda.mul(IS_RATE) : zero;
    const net = ebitda.minus(isTax);

    const toMoney = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const totalExpenses = expenses.plus(capex);
    const assets = revenue.mul(new Prisma.Decimal('0.6')).plus(receivablesDelta);
    const liabilities = totalExpenses.mul(new Prisma.Decimal('0.45')).plus(payablesDelta);
    const cfOperating = ebitda.minus(receivablesDelta).plus(payablesDelta);

    return {
      period_id: periodId,
      is_revenue: toMoney(revenue),
      is_expenses: toMoney(totalExpenses),
      is_ebitda: toMoney(ebitda),
      is_net: toMoney(net),
      bs_assets: toMoney(assets),
      bs_liabilities: toMoney(liabilities),
      bs_equity: toMoney(assets.minus(liabilities)),
      cf_operating: toMoney(cfOperating),
      cf_investing: toMoney(capex.negated()),
      cf_financing: toMoney(zero),
    };
  }

  async upsertScenarioSnapshot(params: {
    scenarioId: string;
    orgId: string;
    periodId: string;
    is_revenue: Prisma.Decimal;
    is_expenses: Prisma.Decimal;
    is_ebitda: Prisma.Decimal;
    is_net: Prisma.Decimal;
    bs_assets: Prisma.Decimal;
    bs_liabilities: Prisma.Decimal;
    bs_equity: Prisma.Decimal;
    cf_operating: Prisma.Decimal;
    cf_investing: Prisma.Decimal;
    cf_financing: Prisma.Decimal;
  }): Promise<void> {
    await this.prisma.financialSnapshot.upsert({
      where: {
        org_id_period_id_scenario_id: {
          org_id: params.orgId,
          period_id: params.periodId,
          scenario_id: params.scenarioId,
        },
      },
      create: {
        org_id: params.orgId,
        period_id: params.periodId,
        scenario_id: params.scenarioId,
        is_revenue: params.is_revenue,
        is_expenses: params.is_expenses,
        is_ebitda: params.is_ebitda,
        is_net: params.is_net,
        bs_assets: params.bs_assets,
        bs_liabilities: params.bs_liabilities,
        bs_equity: params.bs_equity,
        cf_operating: params.cf_operating,
        cf_investing: params.cf_investing,
        cf_financing: params.cf_financing,
        calculated_at: new Date(),
      },
      update: {
        is_revenue: params.is_revenue,
        is_expenses: params.is_expenses,
        is_ebitda: params.is_ebitda,
        is_net: params.is_net,
        bs_assets: params.bs_assets,
        bs_liabilities: params.bs_liabilities,
        bs_equity: params.bs_equity,
        cf_operating: params.cf_operating,
        cf_investing: params.cf_investing,
        cf_financing: params.cf_financing,
        calculated_at: new Date(),
      },
    });
  }

  async findManySavedByIds(orgId: string, ids: string[], role: UserRole): Promise<RepoScenario[]> {
    return this.prisma.scenario.findMany({
      where: {
        org_id: orgId,
        id: { in: ids },
        status: ScenarioStatus.SAVED,
      },
      include: {
        hypotheses: role === UserRole.LECTEUR ? false : true,
        snapshots: {
          orderBy: { calculated_at: 'desc' },
          take: 1,
        },
      },
    }) as unknown as RepoScenario[];
  }

  async isReferencedInReport(scenarioId: string, orgId: string): Promise<boolean> {
    const count = await this.prisma.auditLog.count({
      where: {
        org_id: orgId,
        action: 'EXPORT',
        entity_type: 'REPORT',
        entity_id: scenarioId,
      },
    });
    return count > 0;
  }

  async deleteScenario(scenarioId: string, orgId: string): Promise<void> {
    await this.prisma.scenario.deleteMany({
      where: { id: scenarioId, org_id: orgId },
    });
  }
}
