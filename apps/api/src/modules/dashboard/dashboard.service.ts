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

  async findValuesByPeriods(orgId: string, periodIds: string[]): Promise<KpiValueResponseDto[]> {
    if (periodIds.length === 0) return [];
    const additive = new Set(['CA', 'EBITDA', 'CHARGES', 'OPEX']);
    const values = await this.prisma.kpiValue.findMany({
      where: {
        org_id: orgId,
        period_id: { in: periodIds },
        scenario_id: null,
        kpi: { is_active: true },
      },
      include: { kpi: true },
      orderBy: { calculated_at: 'asc' },
    });

    const byCode = new Map<string, (typeof values)[number][]>();
    for (const v of values) {
      const arr = byCode.get(v.kpi.code) ?? [];
      arr.push(v);
      byCode.set(v.kpi.code, arr);
    }

    const result: KpiValueResponseDto[] = [];
    for (const [code, kpiVals] of byCode.entries()) {
      const latest = kpiVals[kpiVals.length - 1];
      const aggregatedValue = additive.has(code)
        ? kpiVals.reduce((s, v) => s.plus(v.value), new Prisma.Decimal(0))
        : latest.value;
      result.push({
        kpi_id: latest.kpi_id,
        kpi_code: code,
        kpi_label: latest.kpi.label,
        unit: latest.kpi.unit,
        period_id: 'YTD',
        scenario_id: null,
        value: aggregatedValue.toDecimalPlaces(2).toString(),
        severity: latest.severity,
        calculated_at: latest.calculated_at,
      });
    }

    const ca = result.find((r) => r.kpi_code === 'CA');
    const ebitda = result.find((r) => r.kpi_code === 'EBITDA');
    const marge = result.find((r) => r.kpi_code === 'MARGE_EBITDA' || r.kpi_code === 'MARGE');
    if (ca && ebitda && marge) {
      const caDecimal = new Prisma.Decimal(ca.value);
      if (!caDecimal.eq(0)) {
        marge.value = new Prisma.Decimal(ebitda.value)
          .div(caDecimal)
          .mul(100)
          .toDecimalPlaces(2)
          .toString();
      }
    }

    return result.sort((a, b) => {
      const rank: Record<string, number> = { CRITICAL: 3, WARN: 2, INFO: 1 };
      return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
    });
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

  async countUnreadYTD(orgId: string, periodIds: string[]): Promise<number> {
    if (periodIds.length === 0) return 0;
    return this.prisma.alert.count({
      where: { org_id: orgId, period_id: { in: periodIds }, is_read: false },
    });
  }

  async findUnreadTop5YTD(orgId: string, periodIds: string[]): Promise<AlertResponseDto[]> {
    if (periodIds.length === 0) return [];
    const alerts = await this.prisma.alert.findMany({
      where: { org_id: orgId, period_id: { in: periodIds }, is_read: false },
      include: { kpi: true },
      take: 5,
      orderBy: [{ severity: 'desc' }, { created_at: 'desc' }],
    });
    return alerts.map((alert) => ({
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

  async findSummaryYTD(orgId: string, periodIds: string[]): Promise<{
    revenue: Prisma.Decimal;
    expenses: Prisma.Decimal;
    ebitda: Prisma.Decimal;
    net: Prisma.Decimal;
  }> {
    if (periodIds.length === 0) {
      return {
        revenue: new Prisma.Decimal('0'),
        expenses: new Prisma.Decimal('0'),
        ebitda: new Prisma.Decimal('0'),
        net: new Prisma.Decimal('0'),
      };
    }

    const agg = await this.prisma.financialSnapshot.aggregate({
      where: { org_id: orgId, period_id: { in: periodIds }, scenario_id: null },
      _sum: { is_revenue: true, is_expenses: true, is_ebitda: true, is_net: true },
    });

    return {
      revenue: agg._sum.is_revenue ?? new Prisma.Decimal('0'),
      expenses: agg._sum.is_expenses ?? new Prisma.Decimal('0'),
      ebitda: agg._sum.is_ebitda ?? new Prisma.Decimal('0'),
      net: agg._sum.is_net ?? new Prisma.Decimal('0'),
    };
  }

  async findVarianceYTD(
    orgId: string,
    periodIds: string[],
    fiscalYearId: string,
  ): Promise<Array<{ line_label: string; budgeted: number; actual: number; variance_pct: number }>> {
    if (periodIds.length === 0) return [];

    const referenceBudget = await this.prisma.budget.findFirst({
      where: { org_id: orgId, fiscal_year_id: fiscalYearId, is_reference: true, status: BudgetStatus.LOCKED },
      include: { budget_lines: { where: { period_id: { in: periodIds } } } },
    });
    if (!referenceBudget || referenceBudget.budget_lines.length === 0) return [];

    const groups = new Map<string, { budgeted: Prisma.Decimal; actual: Prisma.Decimal }>();
    for (const line of referenceBudget.budget_lines) {
      const key = line.account_label;
      const existing = groups.get(key) ?? { budgeted: new Prisma.Decimal(0), actual: new Prisma.Decimal(0) };
      groups.set(key, {
        budgeted: existing.budgeted.plus(line.amount_budget),
        actual: existing.actual.plus(line.amount_actual),
      });
    }

    return Array.from(groups.entries()).map(([line_label, { budgeted, actual }]) => {
      const variancePct = budgeted.eq(new Prisma.Decimal(0))
        ? 0
        : actual.minus(budgeted).div(budgeted).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
      return { line_label, budgeted: budgeted.toNumber(), actual: actual.toNumber(), variance_pct: variancePct };
    });
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

  async getDashboard(currentUser: DashboardCurrentUser, periodId?: string, ytd?: boolean): Promise<DashboardResponseDto> {
    const startedAt = Date.now();

    if (ytd) {
      return this.getDashboardYTD(currentUser, startedAt);
    }

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

  private async getDashboardYTD(currentUser: DashboardCurrentUser, startedAt: number): Promise<DashboardResponseDto> {
    const cacheKey = `dashboard:${currentUser.org_id}:YTD`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      this.logger.log(`Dashboard YTD cache HIT - org: ${currentUser.org_id} (${Date.now() - startedAt}ms)`);
      return JSON.parse(cached) as DashboardResponseDto;
    }

    const ytdPeriodIds = await this.resolveYTDPeriodIds(currentUser.org_id);
    if (ytdPeriodIds.length === 0) {
      throw new NotFoundException('Aucune période YTD trouvée');
    }

    const [firstPeriod, latestPeriod] = await Promise.all([
      this.prisma.period.findFirst({
        where: { id: { in: ytdPeriodIds } },
        select: { label: true },
        orderBy: { period_number: 'asc' },
      }),
      this.prisma.period.findFirst({
        where: { id: { in: ytdPeriodIds } },
        select: { fiscal_year_id: true, label: true },
        orderBy: { period_number: 'desc' },
      }),
    ]);

    if (!latestPeriod) throw new NotFoundException('Aucune période YTD trouvée');
    const ytdLabel = firstPeriod ? `YTD (${firstPeriod.label} → ${latestPeriod.label})` : 'YTD';

    const [kpis, alertsUnread, alerts, summary, variancePct, runwayWeeks, caTrend] = await Promise.all([
      this.kpisRepository.findValuesByPeriods(currentUser.org_id, ytdPeriodIds),
      this.alertsRepository.countUnreadYTD(currentUser.org_id, ytdPeriodIds),
      this.alertsRepository.findUnreadTop5YTD(currentUser.org_id, ytdPeriodIds),
      this.snapshotsRepository.findSummaryYTD(currentUser.org_id, ytdPeriodIds),
      this.snapshotsRepository.findVarianceYTD(currentUser.org_id, ytdPeriodIds, latestPeriod.fiscal_year_id),
      this.snapshotsRepository.findRunwayWeeks(currentUser.org_id),
      this.kpisRepository.findRevenueTrend3(currentUser.org_id, latestPeriod.fiscal_year_id),
    ]);

    const ebitdaMargin = summary.revenue.eq(new Prisma.Decimal('0'))
      ? new Prisma.Decimal('0')
      : summary.ebitda.div(summary.revenue).mul(new Prisma.Decimal('100'));

    const payload: DashboardResponseDto = {
      period: { id: 'YTD', label: ytdLabel, status: PeriodStatus.OPEN },
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
    this.logger.log(`Dashboard YTD cache MISS - org: ${currentUser.org_id} (${Date.now() - startedAt}ms)`);
    return payload;
  }

  private async resolveYTDPeriodIds(orgId: string): Promise<string[]> {
    const currentMonth = new Date().getMonth() + 1;
    const activePeriod = await this.prisma.period.findFirst({
      where: { org_id: orgId, status: PeriodStatus.OPEN },
      select: { fiscal_year_id: true },
      orderBy: { period_number: 'desc' },
    });
    const periods = await this.prisma.period.findMany({
      where: {
        org_id: orgId,
        ...(activePeriod ? { fiscal_year_id: activePeriod.fiscal_year_id } : {}),
        period_number: { lte: currentMonth },
      },
      select: { id: true },
      orderBy: { period_number: 'asc' },
    });
    return periods.map((p) => p.id);
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
