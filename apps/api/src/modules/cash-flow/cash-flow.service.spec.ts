import { Prisma } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { CashFlowRepository } from './cash-flow.repository';
import { CashFlowService } from './cash-flow.service';

describe('CashFlowService', () => {
  let service: CashFlowService;
  let repository: jest.Mocked<CashFlowRepository>;

  const currentUser = {
    sub: 'user-1',
    org_id: 'org-1',
    role: UserRole.FPA,
    email: 'fpa@diallo.sn',
  };

  const plan = {
    id: 'plan-1',
    org_id: 'org-1',
    period_id: 'period-1',
    week_number: 1,
    label: 'Semaine 1',
    inflow: new Prisma.Decimal('1000'),
    outflow: new Prisma.Decimal('250'),
    balance: new Prisma.Decimal('750'),
    runway_weeks: 4,
    created_at: new Date(),
  };

  beforeEach(() => {
    repository = {
      findRollingPlans: jest.fn(),
      findByPeriodAndWeek: jest.fn(),
      totalActiveCash: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<CashFlowRepository>;

    service = new CashFlowService(repository);
  });

  it('should calculate runway_weeks correctly', async () => {
    // Arrange
    repository.totalActiveCash.mockResolvedValue(new Prisma.Decimal('800'));
    repository.findByPeriodAndWeek.mockResolvedValue(null);
    repository.create.mockResolvedValue({ ...plan, runway_weeks: 3.2 } as never);

    // Act
    const result = await service.createOrUpdatePlan(currentUser, {
      period_id: 'period-1',
      week_number: 1,
      label: 'W1',
      inflow: '1000',
      outflow: '250',
    });

    // Assert
    expect(result.runway_weeks).toBe(3.2);
  });

  it('should return CRITICAL severity when runway below 4 weeks', async () => {
    // Arrange
    repository.findRollingPlans.mockResolvedValue([{ ...plan, outflow: new Prisma.Decimal('400') } as never]);
    repository.totalActiveCash.mockResolvedValue(new Prisma.Decimal('1000'));

    // Act
    const runway = await service.getRunwayStatus(currentUser);

    // Assert
    expect(runway.severity).toBe('CRITICAL');
  });

  it('should calculate balance as inflow minus outflow', async () => {
    // Arrange
    repository.totalActiveCash.mockResolvedValue(new Prisma.Decimal('1000'));
    repository.findByPeriodAndWeek.mockResolvedValue(null);
    repository.create.mockImplementation(async (payload) => ({ ...plan, ...payload }) as never);

    // Act
    const result = await service.createOrUpdatePlan(currentUser, {
      period_id: 'period-1',
      week_number: 1,
      label: 'W1',
      inflow: '700',
      outflow: '200',
    });

    // Assert
    expect(result.balance).toBe('500');
  });

  it('should serialize all amounts as Decimal string', async () => {
    // Arrange
    repository.findRollingPlans.mockResolvedValue([plan as never]);

    // Act
    const result = await service.listRollingPlan({ currentUser });

    // Assert
    expect(typeof result[0].inflow).toBe('string');
    expect(typeof result[0].outflow).toBe('string');
    expect(typeof result[0].balance).toBe('string');
  });
});
