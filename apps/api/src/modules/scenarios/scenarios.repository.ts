import { Injectable } from '@nestjs/common';
import { BudgetStatus, LineType, Prisma, ScenarioStatus, ScenarioType } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { PrismaService } from '../../prisma/prisma.service';

export type RepoScenario = {
  id: string;
  org_id: string;
  budget_id: string;
  name: string;
  type: ScenarioType;
  status: ScenarioStatus;
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
  }): Promise<RepoScenario> {
    return this.prisma.scenario.create({
      data: {
        org_id: data.org_id,
        budget_id: data.budget_id,
        name: data.name,
        type: data.type,
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

    return budget?.status === BudgetStatus.APPROVED;
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

  async calculateSnapshotFromBudget(params: {
    scenarioId: string;
    orgId: string;
    budgetId: string;
    hypotheses: Array<{ parameter: string; value: string; unit: string }>;
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
      select: { period_id: true, line_type: true, amount_budget: true },
      orderBy: { period_id: 'asc' },
    });

    if (lines.length === 0) {
      throw new Error('No budget lines found to calculate scenario');
    }

    const periodId = lines[0].period_id;

    let revenue = lines
      .filter((line) => line.line_type === LineType.REVENUE)
      .reduce((sum, line) => sum.plus(line.amount_budget), new Prisma.Decimal('0'));
    let expenses = lines
      .filter((line) => line.line_type === LineType.EXPENSE)
      .reduce((sum, line) => sum.plus(line.amount_budget), new Prisma.Decimal('0'));
    let capex = lines
      .filter((line) => line.line_type === LineType.CAPEX)
      .reduce((sum, line) => sum.plus(line.amount_budget), new Prisma.Decimal('0'));

    for (const hypothesis of params.hypotheses) {
      const param = hypothesis.parameter.trim().toLowerCase();
      let value: Prisma.Decimal;
      try {
        value = new Prisma.Decimal(hypothesis.value);
      } catch {
        continue;
      }

      if (param === 'revenue_growth') {
        if (hypothesis.unit === '%') {
          revenue = revenue.mul(new Prisma.Decimal('1').plus(value.div(new Prisma.Decimal('100'))));
        } else if (hypothesis.unit === 'FCFA') {
          revenue = revenue.plus(value);
        } else if (hypothesis.unit === 'multiplier') {
          revenue = revenue.mul(value);
        }
      }

      if (param === 'cost_reduction') {
        if (hypothesis.unit === '%') {
          expenses = expenses.mul(new Prisma.Decimal('1').minus(value.div(new Prisma.Decimal('100'))));
        } else if (hypothesis.unit === 'FCFA') {
          const reduced = expenses.minus(value);
          expenses = reduced.lt(new Prisma.Decimal('0')) ? new Prisma.Decimal('0') : reduced;
        } else if (hypothesis.unit === 'multiplier') {
          expenses = expenses.mul(value);
        }
      }

      if (param === 'capex_increase') {
        if (hypothesis.unit === '%') {
          capex = capex.mul(new Prisma.Decimal('1').plus(value.div(new Prisma.Decimal('100'))));
        } else if (hypothesis.unit === 'FCFA') {
          capex = capex.plus(value);
        } else if (hypothesis.unit === 'multiplier') {
          capex = capex.mul(value);
        }
      }
    }

    const ebitda = revenue.minus(expenses);
    const net = ebitda.minus(capex);

    const toMoney = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const totalExpenses = expenses.plus(capex);
    const assets = revenue.mul(new Prisma.Decimal('0.6'));
    const liabilities = totalExpenses.mul(new Prisma.Decimal('0.45'));

    return {
      period_id: periodId,
      is_revenue: toMoney(revenue),
      is_expenses: toMoney(totalExpenses),
      is_ebitda: toMoney(ebitda),
      is_net: toMoney(net),
      bs_assets: toMoney(assets),
      bs_liabilities: toMoney(liabilities),
      bs_equity: toMoney(assets.minus(liabilities)),
      cf_operating: toMoney(ebitda),
      cf_investing: toMoney(capex.negated()),
      cf_financing: new Prisma.Decimal('0'),
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
