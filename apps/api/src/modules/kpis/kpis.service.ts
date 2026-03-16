import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertSeverity, LineType, Prisma } from '@prisma/client';
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
    periodId: string,
    scenarioId?: string,
  ): Promise<KpiValueResponseDto[]> {
    const cacheKey = this.buildCacheKey(currentUser.org_id, periodId, scenarioId);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as KpiValueResponseDto[];
    }

    const values = await this.prisma.kpiValue.findMany({
      where: {
        org_id: currentUser.org_id,
        period_id: periodId,
        ...(scenarioId ? { scenario_id: scenarioId } : { scenario_id: null }),
        kpi: { is_active: true },
      },
      include: {
        kpi: true,
      },
      orderBy: [{ severity: 'desc' }, { calculated_at: 'desc' }],
    });

    const response = values.map((value) => this.toValueResponse(value));

    await this.redisService.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL_KPI);
    return response;
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
        .reduce((s, l) => s + Number(l.amount_actual), 0);

    const ca = sumByType(LineType.REVENUE);
    const opex = sumByType(LineType.EXPENSE);
    const ebitda = ca - opex;
    const marge = ca > 0 ? ((ca - opex) / ca) * 100 : 0;

    const cashAgg = await this.prisma.bankAccount.aggregate({
      where: { org_id: orgId, is_active: true },
      _sum: { balance: true },
    });
    const cash = Number(cashAgg._sum.balance ?? 0);

    const cfPlans = await this.prisma.cashFlowPlan.findMany({
      where: { org_id: orgId, period_id: periodId },
      select: { outflow: true, amount: true, direction: true },
    });
    const totalBurn = cfPlans.reduce((s, p) => {
      const strict = Number(p.amount);
      return s + (strict > 0 && p.direction === 'OUT' ? strict : Number(p.outflow));
    }, 0);
    const avgWeeklyBurn = cfPlans.length > 0 ? totalBurn / cfPlans.length : opex / 4;
    const runway = avgWeeklyBurn > 0 ? cash / avgWeeklyBurn : 0;

    const dso = ca > 0 ? (opex / ca) * 30 : 0;

    const computed: Record<string, number> = {
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

      const decimalValue = new Prisma.Decimal(rawValue.toFixed(2));
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
    value: number,
  ): AlertSeverity {
    const lowerIsBetter = kpiDef.code === 'DSO';

    if (kpiDef.threshold_critical !== null) {
      const crit = Number(kpiDef.threshold_critical);
      if (lowerIsBetter ? value > crit : value < crit) return AlertSeverity.CRITICAL;
    }
    if (kpiDef.threshold_warn !== null) {
      const warn = Number(kpiDef.threshold_warn);
      if (lowerIsBetter ? value > warn : value < warn) return AlertSeverity.WARN;
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
