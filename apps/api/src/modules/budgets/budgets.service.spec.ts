import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { BudgetStatus, LineType, Prisma } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { AuditService } from '../../common/services/audit.service';
import { BudgetsRepository } from './budgets.repository';
import { BudgetsService } from './budgets.service';

describe('BudgetsService', () => {
  let service: BudgetsService;
  let budgetsRepository: jest.Mocked<BudgetsRepository>;
  let auditService: jest.Mocked<AuditService>;
  let calcQueue: jest.Mocked<Queue>;

  const currentUser = {
    sub: 'user-1',
    org_id: 'org-1',
    role: UserRole.FPA,
    email: 'fpa@diallo.sn',
  };

  const baseBudget = {
    id: 'budget-1',
    org_id: 'org-1',
    fiscal_year_id: 'fy-1',
    name: 'Budget FY2026',
    version: 1,
    status: BudgetStatus.DRAFT,
    submitted_at: null,
    submitted_by: null,
    approved_at: null,
    approved_by: null,
    locked_at: null,
    locked_by: null,
    rejection_comment: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    budget_lines: [
      {
        id: 'line-1',
        period_id: 'period-1',
        account_code: '701000',
        account_label: 'Ventes',
        department: 'VENTES',
        line_type: LineType.REVENUE,
        amount_budget: new Prisma.Decimal('1000.50'),
        amount_actual: new Prisma.Decimal('1200.75'),
      },
    ],
  };

  beforeEach(() => {
    budgetsRepository = {
      findPaginated: jest.fn(),
      findByIdInOrg: jest.fn(),
      create: jest.fn(),
      getNextVersion: jest.fn(),
      upsertBudgetLines: jest.fn(),
      setStatus: jest.fn(),
      getContributorDepartments: jest.fn(),
    } as unknown as jest.Mocked<BudgetsRepository>;

    auditService = {
      createLog: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    calcQueue = {
      add: jest.fn(),
    } as unknown as jest.Mocked<Queue>;

    service = new BudgetsService(budgetsRepository, auditService, calcQueue);
  });

  it('should create budget with status DRAFT', async () => {
    // Arrange
    budgetsRepository.getNextVersion.mockResolvedValue(1);
    budgetsRepository.create.mockResolvedValue(baseBudget as never);

    // Act
    const result = await service.createBudget(currentUser, { name: 'Budget FY2026', fiscal_year_id: 'fy-1' });

    // Assert
    expect(result.status).toBe(BudgetStatus.DRAFT);
  });

  it('should throw BUDGET_LOCKED when updating lines on locked budget', async () => {
    // Arrange
    budgetsRepository.findByIdInOrg.mockResolvedValue({ ...baseBudget, status: BudgetStatus.LOCKED } as never);

    // Act
    const act = service.updateLines(currentUser, 'budget-1', { lines: [] });

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  it('should throw BUDGET_NOT_SUBMITTABLE when submitting non-DRAFT budget', async () => {
    // Arrange
    budgetsRepository.findByIdInOrg.mockResolvedValue({ ...baseBudget, status: BudgetStatus.APPROVED } as never);

    // Act
    const act = service.submitBudget(currentUser, 'budget-1');

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  it('should throw BUDGET_NOT_APPROVABLE when approving non-SUBMITTED budget', async () => {
    // Arrange
    budgetsRepository.findByIdInOrg.mockResolvedValue({ ...baseBudget, status: BudgetStatus.DRAFT } as never);

    // Act
    const act = service.approveBudget(currentUser, 'budget-1');

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  it('should throw REJECTION_COMMENT_REQUIRED when comment is empty', async () => {
    // Arrange
    budgetsRepository.findByIdInOrg.mockResolvedValue({ ...baseBudget, status: BudgetStatus.SUBMITTED } as never);

    // Act
    const act = service.rejectBudget(currentUser, 'budget-1', { rejection_comment: '   ' });

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  it('should publish calc-queue job when budget is approved', async () => {
    // Arrange
    budgetsRepository.findByIdInOrg
      .mockResolvedValueOnce({ ...baseBudget, status: BudgetStatus.SUBMITTED } as never)
      .mockResolvedValueOnce({ ...baseBudget, status: BudgetStatus.APPROVED } as never);

    // Act
    await service.approveBudget(currentUser, 'budget-1');

    // Assert
    expect(calcQueue.add).toHaveBeenCalled();
  });

  it('should restrict CONTRIBUTEUR to own department lines only', async () => {
    // Arrange
    const contributeur = {
      ...currentUser,
      role: UserRole.CONTRIBUTEUR,
      department_scope: [{ department: 'VENTES', can_read: true, can_write: true }],
    };
    budgetsRepository.findByIdInOrg.mockResolvedValue(baseBudget as never);
    budgetsRepository.getContributorDepartments.mockResolvedValue(['VENTES']);
    budgetsRepository.upsertBudgetLines.mockResolvedValue();

    // Act
    const act = service.updateLines(contributeur, 'budget-1', {
      lines: [
        {
          period_id: 'period-1',
          account_code: '701000',
          account_label: 'Ventes',
          department: 'RH',
          line_type: LineType.REVENUE,
          amount_budget: '1000.00',
        },
      ],
    });

    // Assert
    await expect(act).rejects.toThrow(NotFoundException);
  });

  it('should return 404 when budget belongs to different org', async () => {
    // Arrange
    budgetsRepository.findByIdInOrg.mockResolvedValue(null);

    // Act
    const act = service.getBudgetById(currentUser, 'budget-other-org');

    // Assert
    await expect(act).rejects.toThrow(NotFoundException);
  });

  it('should serialize amounts as Decimal string never float', async () => {
    // Arrange
    budgetsRepository.findByIdInOrg.mockResolvedValue(baseBudget as never);

    // Act
    const result = await service.getBudgetById(currentUser, 'budget-1');

    // Assert
    expect(typeof result.lines[0].amount_budget).toBe('string');
    expect(typeof result.lines[0].amount_actual).toBe('string');
    expect(typeof result.lines[0].variance).toBe('string');
  });

  it('should create audit_log on every status transition', async () => {
    // Arrange
    budgetsRepository.findByIdInOrg
      .mockResolvedValueOnce({ ...baseBudget, status: BudgetStatus.DRAFT } as never)
      .mockResolvedValueOnce({ ...baseBudget, status: BudgetStatus.SUBMITTED } as never);
    budgetsRepository.setStatus.mockResolvedValue();

    // Act
    await service.submitBudget(currentUser, 'budget-1', '127.0.0.1');

    // Assert
    expect(auditService.createLog).toHaveBeenCalled();
  });
});
