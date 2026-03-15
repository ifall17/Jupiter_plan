import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export type RepoCashFlowPlan = {
  id: string;
  org_id: string;
  period_id: string;
  week_number: number;
  label: string;
  inflow: Prisma.Decimal;
  outflow: Prisma.Decimal;
  balance: Prisma.Decimal;
  runway_weeks: number | null;
  created_at: Date;
};

@Injectable()
export class CashFlowRepository extends BaseRepository<RepoCashFlowPlan> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findOne(id: string, orgId: string): Promise<RepoCashFlowPlan> {
    const plan = await this.findByIdInOrg(id, orgId);
    if (!plan) {
      throw new Error('CASHFLOW_NOT_FOUND');
    }
    return plan;
  }

  async findMany(orgId: string, page: number, limit: number): Promise<PaginatedResponseDto<RepoCashFlowPlan>> {
    const { skip, take } = this.paginate(page, limit);
    const items = await this.prisma.cashFlowPlan.findMany({
      where: { org_id: orgId },
      orderBy: [{ period_id: 'asc' }, { week_number: 'asc' }],
      skip,
      take,
    });
    const total = await this.prisma.cashFlowPlan.count({ where: { org_id: orgId } });

    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: Partial<RepoCashFlowPlan>): Promise<RepoCashFlowPlan> {
    return this.prisma.cashFlowPlan.create({
      data: {
        org_id: data.org_id ?? '',
        period_id: data.period_id ?? '',
        week_number: data.week_number ?? 1,
        label: data.label ?? '',
        inflow: data.inflow ?? new Prisma.Decimal('0'),
        outflow: data.outflow ?? new Prisma.Decimal('0'),
        balance: data.balance ?? new Prisma.Decimal('0'),
        runway_weeks: data.runway_weeks ?? null,
      },
    });
  }

  async update(id: string, orgId: string, data: Partial<RepoCashFlowPlan>): Promise<RepoCashFlowPlan> {
    await this.prisma.cashFlowPlan.updateMany({
      where: { id, org_id: orgId },
      data: {
        label: data.label,
        inflow: data.inflow,
        outflow: data.outflow,
        balance: data.balance,
        runway_weeks: data.runway_weeks,
      },
    });

    return this.findOne(id, orgId);
  }

  async softDelete(_id: string, _orgId: string): Promise<void> {
    throw new Error('NOT_SUPPORTED');
  }

  async findByIdInOrg(id: string, orgId: string): Promise<RepoCashFlowPlan | null> {
    return this.prisma.cashFlowPlan.findFirst({ where: { id, org_id: orgId } });
  }

  async findRollingPlans(params: {
    org_id: string;
    fiscal_year_id?: string;
    period_id?: string;
  }): Promise<RepoCashFlowPlan[]> {
    return this.prisma.cashFlowPlan.findMany({
      where: {
        org_id: params.org_id,
        ...(params.period_id ? { period_id: params.period_id } : {}),
        ...(params.fiscal_year_id
          ? {
              period: {
                fiscal_year_id: params.fiscal_year_id,
              },
            }
          : {}),
      },
      orderBy: [{ period_id: 'asc' }, { week_number: 'asc' }],
      take: 13,
    });
  }

  async findByPeriodAndWeek(orgId: string, periodId: string, weekNumber: number): Promise<RepoCashFlowPlan | null> {
    return this.prisma.cashFlowPlan.findFirst({
      where: {
        org_id: orgId,
        period_id: periodId,
        week_number: weekNumber,
      },
    });
  }

  async totalActiveCash(orgId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.bankAccount.aggregate({
      where: { org_id: orgId, is_active: true },
      _sum: { balance: true },
    });

    return result._sum.balance ?? new Prisma.Decimal('0');
  }
}
