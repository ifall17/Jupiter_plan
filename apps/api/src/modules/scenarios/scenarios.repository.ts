import { Injectable } from '@nestjs/common';
import { BudgetStatus, Prisma, ScenarioStatus, ScenarioType } from '@prisma/client';
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
