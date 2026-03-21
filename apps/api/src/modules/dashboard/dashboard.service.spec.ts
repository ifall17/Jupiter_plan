import { PeriodStatus, Prisma } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  AlertsRepository,
  DashboardService,
  KpisRepository,
  SnapshotsRepository,
} from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: jest.Mocked<PrismaService>;
  let redis: jest.Mocked<RedisService>;
  let kpisRepository: jest.Mocked<KpisRepository>;
  let alertsRepository: jest.Mocked<AlertsRepository>;
  let snapshotsRepository: jest.Mocked<SnapshotsRepository>;

  const currentUser = {
    sub: 'user-1',
    org_id: 'org-1',
    role: UserRole.FPA,
    email: 'fpa@diallo.sn',
  };

  beforeEach(() => {
    prisma = {
      period: {
        findFirst: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      delByPattern: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    kpisRepository = {
      findValuesByPeriod: jest.fn(),
      findRevenueTrend3: jest.fn(),
    } as unknown as jest.Mocked<KpisRepository>;

    alertsRepository = {
      countUnread: jest.fn(),
      findUnreadTop5: jest.fn(),
    } as unknown as jest.Mocked<AlertsRepository>;

    snapshotsRepository = {
      findSummary: jest.fn(),
      findVariancePct: jest.fn(),
      findVarianceByReferenceBudget: jest.fn(),
      findRunwayWeeks: jest.fn(),
    } as unknown as jest.Mocked<SnapshotsRepository>;

    service = new DashboardService(
      prisma,
      redis,
      kpisRepository,
      alertsRepository,
      snapshotsRepository,
    );

    (prisma.period.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: 'period-1',
      fiscal_year_id: 'fy-1',
      label: 'P1',
      status: PeriodStatus.OPEN,
    } as never);

    kpisRepository.findValuesByPeriod.mockResolvedValue([
      {
        kpi_id: 'k1',
        kpi_code: 'MARGIN',
        kpi_label: 'Margin',
        category: null,
        description: null,
        unit: '%',
        period_id: 'period-1',
        scenario_id: null,
        value: '25.40',
        threshold_warn: null,
        threshold_critical: null,
        severity: 'WARN' as never,
        calculated_at: new Date(),
      },
    ]);
    kpisRepository.findRevenueTrend3.mockResolvedValue([
      { period_label: 'P-2', value: '900' },
      { period_label: 'P-1', value: '950' },
      { period_label: 'P0', value: '1000' },
    ]);
    alertsRepository.countUnread.mockResolvedValue(3);
    alertsRepository.findUnreadTop5.mockResolvedValue([
      {
        id: 'a1',
        kpi_id: 'k1',
        kpi_code: 'MARGIN',
        kpi_label: 'Margin',
        period_id: 'period-1',
        severity: 'CRITICAL' as never,
        message: 'critical alert',
        is_read: false,
        created_at: new Date('2026-01-10T00:00:00.000Z'),
      },
      {
        id: 'a2',
        kpi_id: 'k2',
        kpi_code: 'CASH',
        kpi_label: 'Cash',
        period_id: 'period-1',
        severity: 'WARN' as never,
        message: 'warn alert',
        is_read: false,
        created_at: new Date('2026-01-09T00:00:00.000Z'),
      },
    ]);
    snapshotsRepository.findSummary.mockResolvedValue({
      revenue: new Prisma.Decimal('1000'),
      expenses: new Prisma.Decimal('700'),
      ebitda: new Prisma.Decimal('300'),
      net: new Prisma.Decimal('180'),
    });
    snapshotsRepository.findVarianceByReferenceBudget.mockResolvedValue([]);
    snapshotsRepository.findRunwayWeeks.mockResolvedValue('8.50');
  });

  it('should return cached dashboard on second call', async () => {
    // Arrange
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        JSON.stringify({
          period: { id: 'period-1', label: 'P1', status: PeriodStatus.OPEN },
          kpis: [],
          alerts_unread: 0,
          alerts: [],
          is_summary: {
            revenue: '0',
            expenses: '0',
            ebitda: '0',
            net: '0',
            ebitda_margin: '0',
          },
          variance_pct: [],
          runway_weeks: '0.00',
          ca_trend: [],
        }),
      );

    // Act
    await service.getDashboard(currentUser, 'period-1');
    const second = await service.getDashboard(currentUser, 'period-1');

    // Assert
    expect(second.period.id).toBe('period-1');
    expect(kpisRepository.findValuesByPeriod).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cache after transaction validation', async () => {
    // Arrange
    redis.del.mockResolvedValue(1);
    redis.delByPattern.mockResolvedValue(1);

    // Act
    await service.invalidateCacheAfterTransactionValidation('org-1', 'period-1');

    // Assert
    expect(redis.del).toHaveBeenCalledWith('dashboard:org-1:period-1');
    expect(redis.delByPattern).toHaveBeenCalledWith('dashboard:org-1:AGG:*');
  });

  it('should aggregate all dashboard data in single response', async () => {
    // Arrange
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');

    // Act
    const result = await service.getDashboard(currentUser, 'period-1');

    // Assert
    expect(result.kpis.length).toBe(1);
    expect(result.alerts_unread).toBe(3);
    expect(result.alerts.length).toBe(2);
    expect(result.ca_trend.length).toBe(3);
  });

  it('should scope cache key with org_id never global', async () => {
    // Arrange
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');

    // Act
    await service.getDashboard(currentUser, 'period-1');

    // Assert
    expect(redis.set).toHaveBeenCalledWith(
      'dashboard:org-1:period-1',
      expect.any(String),
      'EX',
      300,
    );
  });

  it('should return alerts sorted by severity then date', async () => {
    // Arrange
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');

    // Act
    const result = await service.getDashboard(currentUser, 'period-1');

    // Assert
    expect(result.alerts[0].severity).toBe('CRITICAL');
    expect(result.alerts[1].severity).toBe('WARN');
  });

  it('should serialize all financial amounts as Decimal string', async () => {
    // Arrange
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');

    // Act
    const result = await service.getDashboard(currentUser, 'period-1');

    // Assert
    expect(typeof result.is_summary.revenue).toBe('string');
    expect(typeof result.is_summary.expenses).toBe('string');
    expect(typeof result.is_summary.ebitda).toBe('string');
    expect(typeof result.is_summary.net).toBe('string');
    expect(Array.isArray(result.variance_pct)).toBe(true);
    expect(typeof result.runway_weeks).toBe('string');
    expect(typeof result.ca_trend[0].value).toBe('string');
  });
});
