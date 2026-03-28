import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, ScenarioStatus, ScenarioType } from '@prisma/client';
import { AuditAction, UserRole } from '@shared/enums';
import { MAX_SCENARIO_COMPARE } from '../../common/constants/business.constants';
import { AuditService } from '../../common/services/audit.service';
import { ScenariosRepository } from './scenarios.repository';
import { ScenariosService } from './scenarios.service';

describe('ScenariosService', () => {
  let service: ScenariosService;
  let repository: jest.Mocked<ScenariosRepository>;
  let auditService: jest.Mocked<AuditService>;
  let calcQueue: { add: jest.Mock };

  const currentUser = {
    sub: 'user-1',
    org_id: 'org-1',
    role: UserRole.FPA,
    email: 'fpa@diallo.sn',
  };

  const draftScenario = {
    id: 'scenario-1',
    org_id: 'org-1',
    budget_id: 'budget-1',
    name: 'Base Scenario',
    type: ScenarioType.BASE,
    status: ScenarioStatus.DRAFT,
    calculation_mode: 'GLOBAL',
    created_at: new Date(),
    hypotheses: [
      {
        id: 'hyp-1',
        label: 'Revenue growth',
        parameter: 'REVENUE_GROWTH',
        value: new Prisma.Decimal('5.25'),
        unit: '%',
      },
    ],
    snapshots: [],
  };

  beforeEach(() => {
    repository = {
      findPaginated: jest.fn(),
      findByIdInOrg: jest.fn(),
      createScenario: jest.fn(),
      isBudgetApproved: jest.fn(),
      replaceHypotheses: jest.fn(),
      updateStatus: jest.fn(),
      updateCalculationMode: jest.fn(),
      calculateSnapshotFromBudget: jest.fn(),
      upsertScenarioSnapshot: jest.fn(),
      findManySavedByIds: jest.fn(),
      isReferencedInReport: jest.fn(),
      deleteScenario: jest.fn(),
    } as unknown as jest.Mocked<ScenariosRepository>;

    auditService = {
      createLog: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    calcQueue = {
      add: jest.fn(),
    };

    service = new ScenariosService(repository, auditService, calcQueue as never);
  });

  it('should reject create when budget is not APPROVED', async () => {
    // Arrange
    repository.isBudgetApproved.mockResolvedValue(false);

    // Act + Assert
    await expect(
      service.createScenario(currentUser, {
        budget_id: 'budget-1',
        name: 'Scenario',
        type: ScenarioType.BASE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should hide hypotheses for LECTEUR role', async () => {
    // Arrange
    repository.findByIdInOrg.mockResolvedValue({ ...draftScenario, status: ScenarioStatus.SAVED } as never);

    // Act
    const result = await service.getScenarioById({ ...currentUser, role: UserRole.LECTEUR }, draftScenario.id);

    // Assert
    expect(result.hypotheses).toBeNull();
  });

  it('should enforce max comparison size fail-secure', async () => {
    // Arrange
    const scenarioIds = Array.from({ length: MAX_SCENARIO_COMPARE + 1 }, (_, idx) => `s-${idx + 1}`);

    // Act + Assert
    await expect(service.compareScenarios(currentUser, { scenario_ids: scenarioIds })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should save only when scenario status is CALCULATED', async () => {
    // Arrange
    repository.findByIdInOrg.mockResolvedValueOnce(draftScenario as never);

    // Act + Assert
    await expect(service.saveScenario(currentUser, draftScenario.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should write SCENARIO_SAVE audit log on save transition', async () => {
    // Arrange
    const calculatedScenario = { ...draftScenario, status: ScenarioStatus.CALCULATED };
    const savedScenario = { ...calculatedScenario, status: ScenarioStatus.SAVED };
    repository.findByIdInOrg
      .mockResolvedValueOnce(calculatedScenario as never)
      .mockResolvedValueOnce(savedScenario as never);
    repository.updateStatus.mockResolvedValue(undefined);

    // Act
    await service.saveScenario(currentUser, calculatedScenario.id, '127.0.0.1');

    // Assert
    expect(auditService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.SCENARIO_SAVE,
        entity_type: 'SCENARIO',
        entity_id: calculatedScenario.id,
      }),
    );
  });

  it('should block delete when scenario is referenced in report', async () => {
    // Arrange
    repository.findByIdInOrg.mockResolvedValue(draftScenario as never);
    repository.isReferencedInReport.mockResolvedValue(true);

    // Act + Assert
    await expect(service.deleteScenario(currentUser, draftScenario.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should calculate snapshot for DRAFT scenario', async () => {
    // Arrange
    repository.findByIdInOrg.mockResolvedValue(draftScenario as never);
    repository.calculateSnapshotFromBudget.mockResolvedValue({
      period_id: 'period-1',
      is_revenue: new Prisma.Decimal('1000'),
      is_expenses: new Prisma.Decimal('800'),
      is_ebitda: new Prisma.Decimal('200'),
      is_net: new Prisma.Decimal('160'),
      bs_assets: new Prisma.Decimal('600'),
      bs_liabilities: new Prisma.Decimal('300'),
      bs_equity: new Prisma.Decimal('300'),
      cf_operating: new Prisma.Decimal('180'),
      cf_investing: new Prisma.Decimal('-50'),
      cf_financing: new Prisma.Decimal('0'),
    } as never);

    // Act
    const result = await service.calculateScenario(currentUser, draftScenario.id);

    // Assert
    expect(repository.calculateSnapshotFromBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: draftScenario.id,
        orgId: currentUser.org_id,
        budgetId: draftScenario.budget_id,
        calculationMode: 'GLOBAL',
      }),
    );
    expect(repository.updateCalculationMode).toHaveBeenCalledWith(
      draftScenario.id,
      currentUser.org_id,
      'GLOBAL',
    );
    expect(repository.upsertScenarioSnapshot).toHaveBeenCalled();
    expect(result).toEqual({ scenario_id: draftScenario.id, status: 'PROCESSING' });
  });

  it('should throw NotFoundException when scenario is missing', async () => {
    // Arrange
    repository.findByIdInOrg.mockResolvedValue(null);

    // Act + Assert
    await expect(service.getScenarioById(currentUser, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
