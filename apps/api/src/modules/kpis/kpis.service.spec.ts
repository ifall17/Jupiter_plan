import { AlertSeverity, Prisma } from '@prisma/client';
import { CalcEngineClient } from '../../common/services/calc-engine.client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { KpisService } from './kpis.service';

describe('KpisService', () => {
  let service: KpisService;
  let prisma: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;
  let calcEngineClient: jest.Mocked<CalcEngineClient>;

  beforeEach(() => {
    prisma = {
      period: {
        findFirst: jest.fn(),
      },
      kpi: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
      budgetLine: {
        findMany: jest.fn(),
      },
      cashFlowPlan: {
        findMany: jest.fn(),
      },
      kpiValue: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      alert: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      delByPattern: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    calcEngineClient = {
      post: jest.fn(),
    } as unknown as jest.Mocked<CalcEngineClient>;

    service = new KpisService(prisma, redisService, calcEngineClient);

    (prisma.period.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: 'period-1',
      org_id: 'org-1',
    } as never);
    (prisma.kpi.findMany as unknown as jest.Mock).mockResolvedValue([
      {
        id: 'kpi-ca',
        code: 'CA',
        threshold_warn: null,
        threshold_critical: null,
      },
    ] as never);
    (prisma.kpi.upsert as unknown as jest.Mock).mockResolvedValue({} as never);
    (prisma.transaction.findMany as unknown as jest.Mock).mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      const where = args?.where;
      const hasValidatedFilter = where && 'is_validated' in where && where.is_validated === true;

      return (hasValidatedFilter
        ? [{ account_code: '701000', amount: new Prisma.Decimal('1000') }]
        : [
            { account_code: '701000', amount: new Prisma.Decimal('1000') },
            { account_code: '701001', amount: new Prisma.Decimal('9000') },
          ]) as never;
    });
    (prisma.budgetLine.findMany as unknown as jest.Mock).mockResolvedValue([] as never);
    (prisma.cashFlowPlan.findMany as unknown as jest.Mock).mockResolvedValue([] as never);
    (prisma.kpiValue.deleteMany as unknown as jest.Mock).mockResolvedValue({ count: 0 } as never);
    (prisma.kpiValue.create as unknown as jest.Mock).mockResolvedValue({
      id: 'value-1',
      value: new Prisma.Decimal('1000.00'),
      severity: AlertSeverity.INFO,
    } as never);
    (prisma.alert.deleteMany as unknown as jest.Mock).mockResolvedValue({ count: 0 } as never);
    (prisma.alert.create as unknown as jest.Mock).mockResolvedValue({} as never);
    calcEngineClient.post.mockResolvedValue({
      is_data: {
        lines: {
          XB: '1000',
          XD: '900',
          XI: '500',
        },
      },
    });
    redisService.del.mockResolvedValue(1);
  });

  it('should calculate KPIs using only validated transactions', async () => {
    const result = await service.calculateForPeriod('org-1', 'period-1');

    expect(result).toEqual({ calculated: 1, kpis: ['CA'] });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          org_id: 'org-1',
          period_id: 'period-1',
          is_validated: true,
        }),
      }),
    );
    expect(prisma.kpiValue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          value: new Prisma.Decimal('1000.00'),
          severity: AlertSeverity.INFO,
        }),
      }),
    );
  });
});