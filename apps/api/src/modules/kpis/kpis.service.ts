import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertSeverity, LineType, PeriodStatus, Prisma } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { CACHE_TTL_KPI } from '../../common/constants/business.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { KpiResponseDto } from './dto/kpi-response.dto';
import { KpiValueResponseDto } from './dto/kpi-value-response.dto';

export interface KpiCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class KpisService {
  private readonly logger = new Logger(KpisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async listActiveKpis(currentUser: KpiCurrentUser): Promise<KpiResponseDto[]> {
    const kpis = await this.prisma.kpi.findMany({
      where: {
        org_id: currentUser.org_id,
        is_active: true,
      },
      orderBy: { code: 'asc' },
    });

    return kpis.map((kpi) => ({
      id: kpi.id,
      code: kpi.code,
      label: kpi.label,
      formula: kpi.formula,
      unit: kpi.unit,
      threshold_warn: kpi.threshold_warn?.toString() ?? null,
      threshold_critical: kpi.threshold_critical?.toString() ?? null,
      is_active: kpi.is_active,
    }));
  }

  async getValues(
    currentUser: KpiCurrentUser,
    periodId?: string,
    scenarioId?: string,
    ytd?: boolean,
    quarter?: number,
    fromPeriod?: string,
    toPeriod?: string,
  ): Promise<KpiValueResponseDto[]> {
    const resolution = await this.resolvePeriodIds(currentUser.org_id, {
      periodId,
      ytd,
      quarter,
      fromPeriod,
      toPeriod,
    });

    if (resolution.periodIds.length === 0) {
      return [];
    }

    if (resolution.mode === 'single') {
      const targetPeriodId = resolution.periodIds[0];
      const cacheKey = this.buildCacheKey(currentUser.org_id, targetPeriodId, scenarioId);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as KpiValueResponseDto[];
      }

      const values = await this.prisma.kpiValue.findMany({
        where: {
          org_id: currentUser.org_id,
          period_id: targetPeriodId,
          ...(scenarioId ? { scenario_id: scenarioId } : { scenario_id: null }),
          kpi: { is_active: true },
        },
        include: { kpi: true },
        orderBy: [{ severity: 'desc' }, { calculated_at: 'desc' }],
      });

      const response = values.map((value) => this.toValueResponse(value));
      await this.redisService.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL_KPI);
      return response;
    }

    return this.getValuesAggregated(currentUser, resolution.periodIds, resolution.virtualPeriodId);
  }

  async getTrend(
    currentUser: KpiCurrentUser,
    kpiCode: string,
    fiscalYearId: string,
  ): Promise<{ kpi_code: string; values: Array<{ period: string; value: string; severity: AlertSeverity }> }> {
    const periods = await this.prisma.period.findMany({
      where: {
        org_id: currentUser.org_id,
        fiscal_year_id: fiscalYearId,
      },
      select: { id: true, label: true, period_number: true },
      orderBy: { period_number: 'desc' },
      take: 12,
    });

    if (periods.length === 0) {
      return { kpi_code: kpiCode, values: [] };
    }

    const periodIds = periods.map((period) => period.id);
    const kpiValues = await this.prisma.kpiValue.findMany({
      where: {
        org_id: currentUser.org_id,
        scenario_id: null,
        period_id: { in: periodIds },
        kpi: {
          code: kpiCode,
          is_active: true,
        },
      },
      include: { period: true },
      orderBy: { period: { period_number: 'asc' } },
    });

    return {
      kpi_code: kpiCode,
      values: kpiValues.map((value) => ({
        period: value.period.label,
        value: value.value.toString(),
        severity: value.severity,
      })),
    };
  }

  async calculateForPeriod(
    orgId: string,
    periodId: string,
  ): Promise<{ calculated: number; kpis: string[] }> {
    this.logger.log(`Calcul KPIs pour periode ${periodId} org ${orgId}`);

    if (!periodId) {
      throw new BadRequestException('period_id requis');
    }

    const period = await this.prisma.period.findFirst({
      where: { id: periodId, org_id: orgId },
    });
    if (!period) {
      throw new NotFoundException('Période introuvable');
    }

    let kpiDefs = await this.prisma.kpi.findMany({
      where: { org_id: orgId, is_active: true },
    });
    this.logger.log(`${kpiDefs.length} KPIs trouves`);

    if (kpiDefs.length === 0) {
      await this.seedDefaultKpis(orgId);
      kpiDefs = await this.prisma.kpi.findMany({
        where: { org_id: orgId, is_active: true },
      });
      this.logger.log(`Apres seed: ${kpiDefs.length} KPIs trouves`);
    }

    const budgetLines = await this.prisma.budgetLine.findMany({
      where: { org_id: orgId, period_id: periodId },
      select: { line_type: true, amount_actual: true },
    });

    const sumByType = (type: LineType) =>
      budgetLines
        .filter((l) => l.line_type === type)
        .reduce((s, l) => s.plus(l.amount_actual), new Prisma.Decimal('0'));

    const ca = sumByType(LineType.REVENUE);
    const opex = sumByType(LineType.EXPENSE);
    const ebitda = ca.minus(opex);
    const marge = ca.gt(new Prisma.Decimal('0'))
      ? ebitda.div(ca).mul(new Prisma.Decimal('100'))
      : new Prisma.Decimal('0');

    const cashAgg = await this.prisma.bankAccount.aggregate({
      where: { org_id: orgId, is_active: true },
      _sum: { balance: true },
    });
    const cash = cashAgg._sum.balance ?? new Prisma.Decimal('0');

    const cfPlans = await this.prisma.cashFlowPlan.findMany({
      where: { org_id: orgId, period_id: periodId },
      select: { outflow: true, amount: true, direction: true },
    });
    const totalBurn = cfPlans.reduce((s, p) => {
      const strict = p.amount;
      return s.plus(strict.gt(new Prisma.Decimal('0')) && p.direction === 'OUT' ? strict : p.outflow);
    }, new Prisma.Decimal('0'));
    const avgWeeklyBurn = cfPlans.length > 0
      ? totalBurn.div(new Prisma.Decimal(cfPlans.length.toString()))
      : opex.div(new Prisma.Decimal('4'));
    const runway = avgWeeklyBurn.gt(new Prisma.Decimal('0'))
      ? cash.div(avgWeeklyBurn)
      : new Prisma.Decimal('0');

    const dso = ca.gt(new Prisma.Decimal('0'))
      ? opex.div(ca).mul(new Prisma.Decimal('30'))
      : new Prisma.Decimal('0');

    const computed: Record<string, Prisma.Decimal> = {
      CA: ca,
      EBITDA: ebitda,
      MARGE: marge,
      MARGE_EBITDA: marge,
      CHARGES: opex,
      RUNWAY: runway,
      DSO: dso,
    };

    const calculatedCodes: string[] = [];

    for (const kpiDef of kpiDefs) {
      const rawValue = computed[kpiDef.code];
      if (rawValue === undefined) continue;

      const decimalValue = rawValue.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const severity = this.computeKpiSeverity(kpiDef, rawValue);

      await this.prisma.kpiValue.deleteMany({
        where: { org_id: orgId, kpi_id: kpiDef.id, period_id: periodId, scenario_id: null },
      });
      await this.prisma.kpiValue.create({
        data: {
          org_id: orgId,
          kpi_id: kpiDef.id,
          period_id: periodId,
          scenario_id: null,
          value: decimalValue,
          severity,
          calculated_at: new Date(),
        },
      });

      calculatedCodes.push(kpiDef.code);
    }

    await this.invalidateCacheForPeriod(orgId, periodId);

    this.logger.log(
      `KPIs calculés - org: ${orgId}, period: ${periodId}, codes: [${calculatedCodes.join(', ')}]`,
    );

    return { calculated: calculatedCodes.length, kpis: calculatedCodes };
  }

  private async getValuesAggregated(
    currentUser: KpiCurrentUser,
    periodIds: string[],
    virtualPeriodId: string,
  ): Promise<KpiValueResponseDto[]> {
    if (periodIds.length === 0) return [];

    const additive = new Set(['CA', 'EBITDA', 'CHARGES', 'OPEX']);
    const values = await this.prisma.kpiValue.findMany({
      where: {
        org_id: currentUser.org_id,
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
      const severity = this.computeKpiSeverity(latest.kpi, aggregatedValue);
      result.push({
        kpi_id: latest.kpi_id,
        kpi_code: code,
        kpi_label: latest.kpi.label,
        unit: latest.kpi.unit,
        period_id: virtualPeriodId,
        scenario_id: null,
        value: aggregatedValue.toDecimalPlaces(2).toString(),
        severity,
        calculated_at: latest.calculated_at,
      });
    }

    const caEntry = result.find((r) => r.kpi_code === 'CA');
    const ebitdaEntry = result.find((r) => r.kpi_code === 'EBITDA');
    const margeEntry = result.find((r) => r.kpi_code === 'MARGE_EBITDA' || r.kpi_code === 'MARGE');
    if (caEntry && ebitdaEntry && margeEntry) {
      const caDecimal = new Prisma.Decimal(caEntry.value);
      if (!caDecimal.eq(0)) {
        const newMarge = new Prisma.Decimal(ebitdaEntry.value)
          .div(caDecimal)
          .mul(100)
          .toDecimalPlaces(2)
          .toString();
        margeEntry.value = newMarge;
        const margeKpiVals = byCode.get(margeEntry.kpi_code);
        if (margeKpiVals?.length) {
          margeEntry.severity = this.computeKpiSeverity(margeKpiVals[0].kpi, new Prisma.Decimal(newMarge));
        }
      }
    }

    return result.sort((a, b) => {
      const rank: Record<string, number> = { CRITICAL: 3, WARN: 2, INFO: 1 };
      return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
    });
  }

  private async resolvePeriodIds(
    orgId: string,
    params: { periodId?: string; ytd?: boolean; quarter?: number; fromPeriod?: string; toPeriod?: string },
  ): Promise<{ periodIds: string[]; mode: 'single' | 'aggregate'; virtualPeriodId: string }> {
    if (params.periodId) {
      return { periodIds: [params.periodId], mode: 'single', virtualPeriodId: params.periodId };
    }

    const activePeriod = await this.prisma.period.findFirst({
      where: { org_id: orgId, status: PeriodStatus.OPEN },
      select: { fiscal_year_id: true },
      orderBy: { period_number: 'desc' },
    });

    const fiscalYearId = activePeriod?.fiscal_year_id;
    if (!fiscalYearId) {
      return { periodIds: [], mode: 'aggregate', virtualPeriodId: 'AGG' };
    }

    if (params.ytd) {
      const currentMonth = new Date().getMonth() + 1;
      const periods = await this.prisma.period.findMany({
        where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { lte: currentMonth } },
        select: { id: true },
        orderBy: { period_number: 'asc' },
      });
      return { periodIds: periods.map((p) => p.id), mode: 'aggregate', virtualPeriodId: 'YTD' };
    }

    if (params.quarter && params.quarter >= 1 && params.quarter <= 4) {
      const start = (params.quarter - 1) * 3 + 1;
      const end = start + 2;
      const periods = await this.prisma.period.findMany({
        where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { gte: start, lte: end } },
        select: { id: true },
        orderBy: { period_number: 'asc' },
      });
      return { periodIds: periods.map((p) => p.id), mode: 'aggregate', virtualPeriodId: `Q${params.quarter}` };
    }

    if (params.fromPeriod && params.toPeriod) {
      const bounds = await this.prisma.period.findMany({
        where: {
          org_id: orgId,
          id: { in: [params.fromPeriod, params.toPeriod] },
          fiscal_year_id: fiscalYearId,
        },
        select: { id: true, period_number: true },
      });
      if (bounds.length < 2) {
        return { periodIds: [], mode: 'aggregate', virtualPeriodId: 'CUSTOM' };
      }

      const from = bounds.find((b) => b.id === params.fromPeriod);
      const to = bounds.find((b) => b.id === params.toPeriod);
      if (!from || !to) {
        return { periodIds: [], mode: 'aggregate', virtualPeriodId: 'CUSTOM' };
      }

      const min = Math.min(from.period_number, to.period_number);
      const max = Math.max(from.period_number, to.period_number);
      const periods = await this.prisma.period.findMany({
        where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { gte: min, lte: max } },
        select: { id: true },
        orderBy: { period_number: 'asc' },
      });
      return {
        periodIds: periods.map((p) => p.id),
        mode: 'aggregate',
        virtualPeriodId: `CUSTOM:${params.fromPeriod}:${params.toPeriod}`,
      };
    }

    return { periodIds: [], mode: 'aggregate', virtualPeriodId: 'AGG' };
  }

  private async seedDefaultKpis(orgId: string): Promise<void> {
    const defaults: Array<{
      code: string;
      label: string;
      unit: string;
      formula: string;
      threshold_warn: Prisma.Decimal | null;
      threshold_critical: Prisma.Decimal | null;
    }> = [
      {
        code: 'CA',
        label: "Chiffre d'Affaires",
        unit: 'FCFA',
        formula: 'SUM(REVENUE)',
        threshold_warn: null,
        threshold_critical: null,
      },
      {
        code: 'EBITDA',
        label: 'EBITDA',
        unit: 'FCFA',
        formula: 'CA - OPEX',
        threshold_warn: null,
        threshold_critical: null,
      },
      {
        code: 'MARGE_EBITDA',
        label: 'Marge EBITDA',
        unit: '%',
        formula: '((CA - OPEX) / CA) * 100',
        threshold_warn: new Prisma.Decimal('10'),
        threshold_critical: new Prisma.Decimal('5'),
      },
      {
        code: 'CHARGES',
        label: 'Charges totales',
        unit: 'FCFA',
        formula: 'SUM(EXPENSE)',
        threshold_warn: null,
        threshold_critical: null,
      },
      {
        code: 'RUNWAY',
        label: 'Runway Tresorerie',
        unit: 'semaines',
        formula: 'Cash / BurnRate',
        threshold_warn: new Prisma.Decimal('8'),
        threshold_critical: new Prisma.Decimal('4'),
      },
    ];

    for (const kpi of defaults) {
      await this.prisma.kpi.upsert({
        where: {
          org_id_code: {
            org_id: orgId,
            code: kpi.code,
          },
        },
        update: {},
        create: {
          org_id: orgId,
          code: kpi.code,
          label: kpi.label,
          formula: kpi.formula,
          unit: kpi.unit,
          threshold_warn: kpi.threshold_warn,
          threshold_critical: kpi.threshold_critical,
          is_active: true,
        },
      });
    }
  }

  private computeKpiSeverity(
    kpiDef: { code: string; threshold_warn: Prisma.Decimal | null; threshold_critical: Prisma.Decimal | null },
    value: Prisma.Decimal,
  ): AlertSeverity {
    const lowerIsBetter = kpiDef.code === 'DSO';

    if (kpiDef.threshold_critical !== null) {
      if (lowerIsBetter ? value.gt(kpiDef.threshold_critical) : value.lt(kpiDef.threshold_critical)) {
        return AlertSeverity.CRITICAL;
      }
    }
    if (kpiDef.threshold_warn !== null) {
      if (lowerIsBetter ? value.gt(kpiDef.threshold_warn) : value.lt(kpiDef.threshold_warn)) {
        return AlertSeverity.WARN;
      }
    }
    return AlertSeverity.INFO;
  }

  async invalidateCacheForPeriod(orgId: string, periodId: string): Promise<void> {
    const key = this.buildCacheKey(orgId, periodId);
    await this.redisService.del(key);
    this.logger.log(`KPI cache invalidated - org: ${orgId}, period: ${periodId}`);
  }

  private buildCacheKey(orgId: string, periodId: string, scenarioId?: string): string {
    if (!scenarioId) {
      return `kpis:${orgId}:${periodId}`;
    }
    return `kpis:${orgId}:${periodId}:scenario:${scenarioId}`;
  }

  private toValueResponse(value: Prisma.KpiValueGetPayload<{ include: { kpi: true } }>): KpiValueResponseDto {
    return {
      kpi_id: value.kpi_id,
      kpi_code: value.kpi.code,
      kpi_label: value.kpi.label,
      unit: value.kpi.unit,
      period_id: value.period_id,
      scenario_id: value.scenario_id,
      value: value.value.toString(),
      severity: value.severity,
      calculated_at: value.calculated_at,
    };
  }
}
