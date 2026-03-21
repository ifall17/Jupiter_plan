import { Injectable } from '@nestjs/common';
import { BudgetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { BudgetLineDto } from './dto/update-budget-line.dto';

export type RepoBudgetLine = {
  id: string;
  period_id: string;
  period?: { label: string };
  account_code: string;
  account_label: string;
  department: string;
  line_type: string;
  amount_budget: Prisma.Decimal;
  amount_actual: Prisma.Decimal;
};

export type RepoBudget = {
  id: string;
  org_id: string;
  fiscal_year_id: string;
  parent_budget_id: string | null;
  name: string;
  version: number;
  status: BudgetStatus;
  is_reference: boolean;
  submitted_at: Date | null;
  submitted_by: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  locked_at: Date | null;
  locked_by: string | null;
  rejection_comment: string | null;
  created_at: Date;
  budget_lines: RepoBudgetLine[];
};

@Injectable()
export class BudgetsRepository extends BaseRepository<RepoBudget> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findOne(id: string, orgId: string): Promise<RepoBudget> {
    const budget = await this.findByIdInOrg(id, orgId);
    if (!budget) {
      throw new Error('BUDGET_NOT_FOUND');
    }
    return budget;
  }

  async findMany(orgId: string, page: number, limit: number): Promise<PaginatedResponseDto<RepoBudget>> {
    const { skip, take } = this.paginate(page, limit);
    const { items, total } = await this.findPaginated({ org_id: orgId, skip, take });
    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: Partial<RepoBudget>): Promise<RepoBudget> {
    const created = await this.prisma.budget.create({
      data: {
        org_id: data.org_id ?? '',
        fiscal_year_id: data.fiscal_year_id ?? '',
        parent_budget_id: data.parent_budget_id ?? null,
        name: data.name ?? '',
        version: data.version ?? 1,
        status: data.status ?? BudgetStatus.DRAFT,
        is_reference: data.is_reference ?? false,
      },
      include: { budget_lines: true },
    });

    return created;
  }

  async update(id: string, orgId: string, data: Partial<RepoBudget>): Promise<RepoBudget> {
    await this.prisma.budget.updateMany({
      where: { id, org_id: orgId },
      data: {
        parent_budget_id: data.parent_budget_id,
        name: data.name,
        status: data.status,
        is_reference: data.is_reference,
        submitted_at: data.submitted_at,
        submitted_by: data.submitted_by,
        approved_at: data.approved_at,
        approved_by: data.approved_by,
        locked_at: data.locked_at,
        locked_by: data.locked_by,
        rejection_comment: data.rejection_comment,
      },
    });

    const updated = await this.findByIdInOrg(id, orgId);
    if (!updated) {
      throw new Error('BUDGET_NOT_FOUND');
    }

    return updated;
  }

  async updateMany(
    where: Prisma.BudgetWhereInput,
    data: Prisma.BudgetUpdateManyMutationInput,
  ): Promise<void> {
    await this.prisma.budget.updateMany({ where, data });
  }

  async softDelete(_id: string, _orgId: string): Promise<void> {
    throw new Error('NOT_SUPPORTED');
  }

  async findByIdInOrg(id: string, orgId: string): Promise<RepoBudget | null> {
    return this.prisma.budget.findFirst({
      where: { id, org_id: orgId },
      include: {
        budget_lines: {
          orderBy: { account_code: 'asc' },
          include: { period: { select: { label: true } } },
        },
      },
    }) as unknown as RepoBudget | null;
  }

  async findPaginated(params: {
    org_id: string;
    fiscal_year_id?: string;
    status?: BudgetStatus;
    skip: number;
    take: number;
  }): Promise<{ items: RepoBudget[]; total: number }> {
    const where: Prisma.BudgetWhereInput = { org_id: params.org_id };

    if (params.fiscal_year_id) {
      where.fiscal_year_id = params.fiscal_year_id;
    }

    if (params.status) {
      where.status = params.status;
    }

    const items = (await this.prisma.budget.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { created_at: 'desc' },
      include: {
        budget_lines: {
          orderBy: { account_code: 'asc' },
          include: { period: { select: { label: true } } },
        },
      },
    })) as unknown as RepoBudget[];
    const total = await this.prisma.budget.count({ where });

    return { items, total };
  }

  async getNextVersion(orgId: string, fiscalYearId: string): Promise<number> {
    const last = await this.prisma.budget.findFirst({
      where: { org_id: orgId, fiscal_year_id: fiscalYearId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return (last?.version ?? 0) + 1;
  }

  async upsertBudgetLines(
    budgetId: string,
    orgId: string,
    userId: string,
    lines: BudgetLineDto[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        if (line.id) {
          await tx.budgetLine.updateMany({
            where: {
              id: line.id,
              budget_id: budgetId,
              org_id: orgId,
            },
            data: {
              period_id: line.period_id,
              account_code: line.account_code,
              account_label: line.account_label,
              department: line.department,
              line_type: line.line_type,
              amount_budget: line.amount_budget,
            },
          });
          continue;
        }

        await tx.budgetLine.create({
          data: {
            budget_id: budgetId,
            org_id: orgId,
            period_id: line.period_id,
            account_code: line.account_code,
            account_label: line.account_label,
            department: line.department,
            line_type: line.line_type,
            amount_budget: line.amount_budget,
            created_by: userId,
          },
        });
      }
    });
  }

  async deleteLineById(budgetId: string, orgId: string, lineId: string): Promise<void> {
    await this.prisma.budgetLine.deleteMany({
      where: { id: lineId, budget_id: budgetId, org_id: orgId },
    });
  }

  async setStatus(
    budgetId: string,
    orgId: string,
    data: {
      status: BudgetStatus;
      submitted_at?: Date | null;
      submitted_by?: string | null;
      approved_at?: Date | null;
      approved_by?: string | null;
      locked_at?: Date | null;
      locked_by?: string | null;
      rejection_comment?: string | null;
    },
  ): Promise<void> {
    await this.prisma.budget.updateMany({
      where: { id: budgetId, org_id: orgId },
      data,
    });
  }

  async deleteBudget(budgetId: string, orgId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.budgetLine.deleteMany({
        where: {
          budget_id: budgetId,
          org_id: orgId,
        },
      });

      await tx.budget.deleteMany({
        where: {
          id: budgetId,
          org_id: orgId,
        },
      });
    });
  }

  async getContributorDepartments(userId: string): Promise<string[]> {
    const rows = await this.prisma.userDepartmentScope.findMany({
      where: {
        user_id: userId,
        can_read: true,
      },
      select: { department: true },
    });

    return rows.map((row) => row.department);
  }
}
