import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertSeverity, BudgetStatus, PeriodStatus, Prisma } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { CACHE_TTL_KPI } from '../../common/constants/business.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AlertResponseDto } from '../alerts/dto/alert-response.dto';
import { KpiValueResponseDto } from '../kpis/dto/kpi-value-response.dto';
import { DashboardResponseDto } from './dto/dashboard-response.dto';

export interface DashboardCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class KpisRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findValuesByPeriod(orgId: string, periodId: string): Promise<KpiValueResponseDto[]> {
    const values = await this.prisma.kpiValue.findMany({
      where: {
        org_id: orgId,
        period_id: periodId,
        scenario_id: null,
        kpi: { is_active: true },
      },
      include: { kpi: true },
      orderBy: [{ severity: 'desc' }, { calculated_at: 'desc' }],
    });

    return values.map((value) => ({
      kpi_id: value.kpi_id,
      kpi_code: value.kpi.code,
      kpi_label: value.kpi.label,
      unit: value.kpi.unit,
      period_id: value.period_id,
      scenario_id: value.scenario_id,
      value: value.value.toString(),
      severity: value.severity,
      calculated_at: value.calculated_at,
    }));
  }

  async findRevenueTrend3(orgId: string, fiscalYearId: string): Promise<Array<{ period_label: string; value: string }>> {
    const snapshots = await this.prisma.financialSnapshot.findMany({
      where: {
        org_id: orgId,
        scenario_id: null,
        period: { fiscal_year_id: fiscalYearId },
      },
      include: { period: true },
      orderBy: { period: { period_number: 'desc' } },
      take: 3,
    });

    return snapshots
      .map((snapshot) => ({
        period_label: snapshot.period.label,
        value: snapshot.is_revenue.toString(),
      }))
      .reverse();
  }
}

@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countUnread(orgId: string, periodId: string): Promise<number> {
    return this.prisma.alert.count({
      where: {
        org_id: orgId,
        period_id: periodId,
        is_read: false,
      },
    });
  }

  async findUnreadTop5(orgId: string, periodId: string): Promise<AlertResponseDto[]> {
    const alerts = await this.prisma.alert.findMany({
      where: {
        org_id: orgId,
        period_id: periodId,
        is_read: false,
      },
      include: { kpi: true },
      take: 5,
    });

    return alerts
      .sort((a, b) => {
        const severityDiff = this.getSeverityRank(b.severity) - this.getSeverityRank(a.severity);
        if (severityDiff !== 0) {
          return severityDiff;
        }
        return b.created_at.getTime() - a.created_at.getTime();
      })
      .map((alert) => ({
        id: alert.id,
        kpi_id: alert.kpi_id,
        kpi_code: alert.kpi.code,
        kpi_label: alert.kpi.label,
        period_id: alert.period_id,
        severity: alert.severity,
        message: alert.message,
        is_read: alert.is_read,
        created_at: alert.created_at,
      }));
  }

  private getSeverityRank(severity: AlertSeverity): number {
    if (severity === AlertSeverity.CRITICAL) {
      return 3;
    }
    if (severity === AlertSeverity.WARN) {
      return 2;
    }
    return 1;
  }
}

@Injectable()
export class SnapshotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSummary(orgId: string, periodId: string): Promise<{
    revenue: Prisma.Decimal;
    expenses: Prisma.Decimal;
    ebitda: Prisma.Decimal;
    net: Prisma.Decimal;
  }> {
    const snapshot = await this.prisma.financialSnapshot.findFirst({
      where: {
        org_id: orgId,
        period_id: periodId,
        scenario_id: null,
      },
      orderBy: { calculated_at: 'desc' },
    });

    if (!snapshot) {
      return {
        revenue: new Prisma.Decimal('0'),
        expenses: new Prisma.Decimal('0'),
        ebitda: new Prisma.Decimal('0'),
        net: new Prisma.Decimal('0'),
      };
    }

    return {
      revenue: snapshot.is_revenue,
      expenses: snapshot.is_expenses,
      ebitda: snapshot.is_ebitda,
      net: snapshot.is_net,
    };
  }

  async findVariancePct(orgId: string, periodId: string): Promise<string> {
    const aggregate = await this.prisma.budgetLine.aggregate({
      where: {
        org_id: orgId,
        period_id: periodId,
      },
      _sum: {
        amount_budget: true,
        amount_actual: true,
      },
    });

    const budget = aggregate._sum.amount_budget ?? new Prisma.Decimal('0');
    const actual = aggregate._sum.amount_actual ?? new Prisma.Decimal('0');

    if (budget.eq(new Prisma.Decimal('0'))) {
      return '0.00';
    }

    const variance = actual.minus(budget).div(budget).mul(new Prisma.Decimal('100'));
    return variance.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString();
  }

  async findVarianceByReferenceBudget(
    orgId: string,
    periodId: string,
    fiscalYearId: string,
  ): Promise<Array<{ line_label: string; budgeted: number; actual: number; variance_pct: number }>> {
    const referenceBudget = await this.prisma.budget.findFirst({
      where: {
        org_id: orgId,
        fiscal_year_id: fiscalYearId,
        is_reference: true,
        status: BudgetStatus.LOCKED,
      },
      include: {
        budget_lines: {
          where: { period_id: periodId },
        },
      },
    });

    if (!referenceBudget || referenceBudget.budget_lines.length === 0) {
      return [];
    }

    const groups = new Map<string, { budgeted: Prisma.Decimal; actual: Prisma.Decimal }>();
    for (const line of referenceBudget.budget_lines) {
      const key = line.account_label;
      const existing = groups.get(key) ?? {
        budgeted: new Prisma.Decimal(0),
        actual: new Prisma.Decimal(0),
      };
      groups.set(key, {
        budgeted: existing.budgeted.plus(line.amount_budget),
        actual: existing.actual.plus(line.amount_actual),
      });
    }

    return Array.from(groups.entries()).map(([line_label, { budgeted, actual }]) => {
      const variancePct = budgeted.eq(new Prisma.Decimal(0))
        ? 0
        : actual
            .minus(budgeted)
            .div(budgeted)
            .mul(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            .toNumber();
      return {
        line_label,
        budgeted: budgeted.toNumber(),
        actual: actual.toNumber(),
        variance_pct: variancePct,
      };
    });
  }

  async findRunwayWeeks(orgId: string): Promise<number> {
    const [plans, cash] = await this.prisma.$transaction([
      this.prisma.cashFlowPlan.findMany({
        where: { org_id: orgId },
        select: { outflow: true },
      }),
      this.prisma.bankAccount.aggregate({
        where: {
          org_id: orgId,
          is_active: true,
        },
        _sum: { balance: true },
      }),
    ]);

    if (plans.length === 0) {
      return 0;
    }

    const burn = plans.reduce((sum, plan) => sum.plus(plan.outflow), new Prisma.Decimal('0'));
    const avgBurn = burn.div(new Prisma.Decimal(plans.length.toString()));
    if (avgBurn.lte(new Prisma.Decimal('0'))) {
      return 0;
    }

    const cashBalance = cash._sum.balance ?? new Prisma.Decimal('0');
    return Number(cashBalance.div(avgBurn).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
  }
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly kpisRepository: KpisRepository,
    private readonly alertsRepository: AlertsRepository,
    private readonly snapshotsRepository: SnapshotsRepository,
  ) {}

  async getDashboard(currentUser: DashboardCurrentUser, periodId?: string): Promise<DashboardResponseDto> {
    const startedAt = Date.now();
    const period = await this.resolvePeriod(currentUser.org_id, periodId);
    const cacheKey = this.buildCacheKey(currentUser.org_id, period.id);

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      this.logger.log(`Dashboard cache HIT - org: ${currentUser.org_id} (${Date.now() - startedAt}ms)`);
      return JSON.parse(cached) as DashboardResponseDto;
    }

    const [kpis, alertsUnread, alerts, summary, variancePct, runwayWeeks, caTrend] = await Promise.all([
      this.kpisRepository.findValuesByPeriod(currentUser.org_id, period.id),
      this.alertsRepository.countUnread(currentUser.org_id, period.id),
      this.alertsRepository.findUnreadTop5(currentUser.org_id, period.id),
      this.snapshotsRepository.findSummary(currentUser.org_id, period.id),
      this.snapshotsRepository.findVarianceByReferenceBudget(currentUser.org_id, period.id, period.fiscal_year_id),
      this.snapshotsRepository.findRunwayWeeks(currentUser.org_id),
      this.kpisRepository.findRevenueTrend3(currentUser.org_id, period.fiscal_year_id),
    ]);

    const ebitdaMargin = summary.revenue.eq(new Prisma.Decimal('0'))
      ? new Prisma.Decimal('0')
      : summary.ebitda.div(summary.revenue).mul(new Prisma.Decimal('100'));

    const payload: DashboardResponseDto = {
      period: {
        id: period.id,
        label: period.label,
        status: period.status,
      },
      kpis,
      alerts_unread: alertsUnread,
      alerts,
      is_summary: {
        revenue: summary.revenue.toString(),
        expenses: summary.expenses.toString(),
        ebitda: summary.ebitda.toString(),
        net: summary.net.toString(),
        ebitda_margin: ebitdaMargin.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
      },
      variance_pct: variancePct,
      runway_weeks: runwayWeeks,
      ca_trend: caTrend,
    };

    await this.redisService.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL_KPI);
    this.logger.log(`Dashboard cache MISS - org: ${currentUser.org_id} (${Date.now() - startedAt}ms)`);

    return payload;
  }

  async invalidateCacheAfterCalcDone(orgId: string, periodId: string): Promise<void> {
    await this.invalidatePeriodCache(orgId, periodId);
  }

  async invalidateCacheAfterTransactionValidation(orgId: string, periodId: string): Promise<void> {
    await this.invalidatePeriodCache(orgId, periodId);
  }

  async invalidateCacheAfterBudgetApproval(orgId: string, periodId: string): Promise<void> {
    await this.invalidatePeriodCache(orgId, periodId);
  }

  async invalidateCacheAfterPeriodClose(orgId: string, periodId: string): Promise<void> {
    await this.invalidatePeriodCache(orgId, periodId);
  }

  async invalidatePeriodCache(orgId: string, periodId: string): Promise<void> {
    await this.redisService.del(this.buildCacheKey(orgId, periodId));
  }

  private async resolvePeriod(orgId: string, periodId?: string): Promise<{
    id: string;
    fiscal_year_id: string;
    label: string;
    status: PeriodStatus;
  }> {
    const period = periodId
      ? await this.prisma.period.findFirst({
          where: { id: periodId, org_id: orgId },
          select: { id: true, fiscal_year_id: true, label: true, status: true },
        })
      : await this.prisma.period.findFirst({
          where: { org_id: orgId, status: PeriodStatus.OPEN },
          select: { id: true, fiscal_year_id: true, label: true, status: true },
          orderBy: { period_number: 'desc' },
        });

    if (!period) {
      throw new NotFoundException();
    }

    return period;
  }

  private buildCacheKey(orgId: string, periodId: string): string {
    return `dashboard:${orgId}:${periodId}`;
  }
}
