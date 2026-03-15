import { Injectable, Logger } from '@nestjs/common';
import { AlertSeverity, Prisma } from '@prisma/client';
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
