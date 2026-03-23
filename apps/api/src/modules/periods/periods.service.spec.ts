import { PeriodStatus, Prisma, UserRole } from '@prisma/client';
import { CalcEngineClient } from '../../common/services/calc-engine.client';
import { SyscohadaMappingService } from '../../common/services/syscohada-mapping.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PeriodsService } from './periods.service';

describe('PeriodsService', () => {
  const currentUser = {
    sub: 'user-1',
    org_id: 'org-1',
    role: UserRole.FPA,
  };

  function buildService() {
    const prisma = {
      period: {
        findFirst: jest.fn(),
      },
      transaction: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const calcEngineClient = {
      post: jest.fn(),
    } as unknown as CalcEngineClient;

    const syscohadaMappingService = {
      resolveFinancialMappings: jest.fn(),
    } as unknown as SyscohadaMappingService;

    const service = new PeriodsService(prisma, calcEngineClient, syscohadaMappingService);

    return {
      service,
      prisma: prisma as any,
      calcEngineClient: calcEngineClient as any,
      syscohadaMappingService: syscohadaMappingService as any,
    };
  }

  function setupTransaction(prisma: any) {
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const trx = {
        financialSnapshot: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'snap-1' }),
          update: jest.fn().mockResolvedValue({ id: 'snap-1' }),
        },
        period: {
          update: jest.fn().mockResolvedValue({ id: 'period-1' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      return callback(trx);
    });
  }

  it('agrège les valeurs via SYSCOHADA et envoie un payload financier détaillé', async () => {
    const { service, prisma, calcEngineClient, syscohadaMappingService } = buildService();

    prisma.period.findFirst.mockResolvedValue({
      id: 'period-1',
      org_id: 'org-1',
      status: PeriodStatus.OPEN,
      period_number: 1,
      fiscal_year_id: 'fy-1',
    });
    prisma.transaction.count.mockResolvedValue(0);
    prisma.transaction.findMany.mockResolvedValue([
      { account_code: '701000', amount: new Prisma.Decimal('1000') },
      { account_code: '601000', amount: new Prisma.Decimal('-400') },
      { account_code: '681000', amount: new Prisma.Decimal('-50') },
      { account_code: '691000', amount: new Prisma.Decimal('-30') },
      { account_code: '521000', amount: new Prisma.Decimal('200') },
      { account_code: '401000', amount: new Prisma.Decimal('-120') },
      { account_code: '471000', amount: new Prisma.Decimal('90') },
      { account_code: '471000', amount: new Prisma.Decimal('-45') },
      { account_code: '221000', amount: new Prisma.Decimal('300') },
    ]);

    syscohadaMappingService.resolveFinancialMappings.mockResolvedValue([
      { statement: 'INCOME_STATEMENT', section: 'REVENUE', presentation_rule: 'INCOME_REVENUE', line_type_hint: 'REVENUE' },
      { statement: 'INCOME_STATEMENT', section: 'EXPENSE', presentation_rule: 'INCOME_EXPENSE', line_type_hint: 'EXPENSE' },
      { statement: 'INCOME_STATEMENT', section: 'EXPENSE', presentation_rule: 'INCOME_EXPENSE', line_type_hint: 'EXPENSE' },
      { statement: 'INCOME_STATEMENT', section: 'EXPENSE', presentation_rule: 'INCOME_EXPENSE', line_type_hint: 'EXPENSE' },
      { statement: 'BALANCE_SHEET', section: 'ASSET', presentation_rule: 'FIXED_ASSET', line_type_hint: null },
      { statement: 'BALANCE_SHEET', section: 'LIABILITY', presentation_rule: 'FIXED_LIABILITY', line_type_hint: null },
      { statement: 'BALANCE_SHEET', section: 'LIABILITY', presentation_rule: 'DYNAMIC_BY_BALANCE_SIGN', line_type_hint: null },
      { statement: 'BALANCE_SHEET', section: 'LIABILITY', presentation_rule: 'DYNAMIC_BY_BALANCE_SIGN', line_type_hint: null },
      { statement: 'BALANCE_SHEET', section: 'ASSET', presentation_rule: 'FIXED_ASSET', line_type_hint: 'CAPEX' },
    ]);

    calcEngineClient.post.mockResolvedValue({
      status: 'CLOSED',
      period_id: 'period-1',
      snapshot: {
        is_revenue: '1000',
        is_expenses: '480',
        is_ebitda: '520',
        is_net: '440',
        bs_assets: '590',
        bs_liabilities: '165',
        bs_equity: '425',
        cf_operating: '520',
        cf_investing: '-300',
        cf_financing: '0',
      },
    });

    setupTransaction(prisma);

    await service.closePeriod('period-1', currentUser);

    const payload = calcEngineClient.post.mock.calls[0][1];
    expect(payload.financial_values).toMatchObject({
      is_revenue: '1000',
      is_expenses: '480',
      ca: '1000',
      charges: '480',
      assets: '590',
      liabilities: '165',
      amortissements: '50',
      taxes: '30',
      cf_operating: '520',
      cf_investing: '-300',
      cf_financing: '0',
    });
  });

  it('reste strict: aucun fallback bilan si pas de comptes bilan mappés', async () => {
    const { service, prisma, calcEngineClient, syscohadaMappingService } = buildService();

    prisma.period.findFirst.mockResolvedValue({
      id: 'period-2',
      org_id: 'org-1',
      status: PeriodStatus.OPEN,
      period_number: 2,
      fiscal_year_id: 'fy-1',
    });
    prisma.transaction.count.mockResolvedValue(0);
    prisma.transaction.findMany.mockResolvedValue([
      { account_code: '701000', amount: new Prisma.Decimal('1000') },
      { account_code: '601000', amount: new Prisma.Decimal('-200') },
    ]);

    syscohadaMappingService.resolveFinancialMappings.mockResolvedValue([
      { statement: 'INCOME_STATEMENT', section: 'REVENUE', presentation_rule: 'INCOME_REVENUE', line_type_hint: 'REVENUE' },
      { statement: 'INCOME_STATEMENT', section: 'EXPENSE', presentation_rule: 'INCOME_EXPENSE', line_type_hint: 'EXPENSE' },
    ]);

    calcEngineClient.post.mockResolvedValue({
      status: 'CLOSED',
      period_id: 'period-2',
      snapshot: {
        is_revenue: '1000',
        is_expenses: '200',
        is_ebitda: '800',
        is_net: '800',
        bs_assets: '0',
        bs_liabilities: '0',
        bs_equity: '0',
        cf_operating: '800',
        cf_investing: '0',
        cf_financing: '0',
      },
    });

    setupTransaction(prisma);

    await service.closePeriod('period-2', currentUser);

    const payload = calcEngineClient.post.mock.calls[0][1];
    expect(payload.financial_values.assets).toBe('0');
    expect(payload.financial_values.liabilities).toBe('0');
    expect(payload.financial_values.cf_investing).toBe('0');
  });
});
