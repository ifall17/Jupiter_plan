"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const budgets_service_1 = require("./budgets.service");
describe('BudgetsService', () => {
    let service;
    let budgetsRepository;
    let auditService;
    let calcQueue;
    const currentUser = {
        sub: 'user-1',
        org_id: 'org-1',
        role: enums_1.UserRole.FPA,
        email: 'fpa@diallo.sn',
    };
    const baseBudget = {
        id: 'budget-1',
        org_id: 'org-1',
        fiscal_year_id: 'fy-1',
        name: 'Budget FY2026',
        version: 1,
        status: client_1.BudgetStatus.DRAFT,
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
                line_type: client_1.LineType.REVENUE,
                amount_budget: new client_1.Prisma.Decimal('1000.50'),
                amount_actual: new client_1.Prisma.Decimal('1200.75'),
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
        };
        auditService = {
            createLog: jest.fn(),
        };
        calcQueue = {
            add: jest.fn(),
        };
        service = new budgets_service_1.BudgetsService(budgetsRepository, auditService, calcQueue);
    });
    it('should create budget with status DRAFT', async () => {
        budgetsRepository.getNextVersion.mockResolvedValue(1);
        budgetsRepository.create.mockResolvedValue(baseBudget);
        budgetsRepository.findByIdInOrg.mockResolvedValue(baseBudget);
        const result = await service.createBudget(currentUser, { name: 'Budget FY2026', fiscal_year_id: 'fy-1' });
        expect(result.status).toBe(client_1.BudgetStatus.DRAFT);
    });
    it('should throw BUDGET_LOCKED when updating lines on locked budget', async () => {
        budgetsRepository.findByIdInOrg.mockResolvedValue({ ...baseBudget, status: client_1.BudgetStatus.LOCKED });
        const act = service.updateLines(currentUser, 'budget-1', { lines: [] });
        await expect(act).rejects.toThrow(common_1.BadRequestException);
    });
    it('should throw BUDGET_NOT_SUBMITTABLE when submitting non-DRAFT budget', async () => {
        budgetsRepository.findByIdInOrg.mockResolvedValue({ ...baseBudget, status: client_1.BudgetStatus.APPROVED });
        const act = service.submitBudget(currentUser, 'budget-1');
        await expect(act).rejects.toThrow(common_1.BadRequestException);
    });
    it('should throw BUDGET_NOT_APPROVABLE when approving non-SUBMITTED budget', async () => {
        budgetsRepository.findByIdInOrg.mockResolvedValue({ ...baseBudget, status: client_1.BudgetStatus.DRAFT });
        const act = service.approveBudget(currentUser, 'budget-1');
        await expect(act).rejects.toThrow(common_1.BadRequestException);
    });
    it('should throw BUDGET_EMPTY when approving budget with zero total budgeted', async () => {
        budgetsRepository.findByIdInOrg.mockResolvedValue({
            ...baseBudget,
            status: client_1.BudgetStatus.SUBMITTED,
            budget_lines: [
                {
                    ...baseBudget.budget_lines[0],
                    amount_budget: new client_1.Prisma.Decimal('0'),
                },
            ],
        });
        const act = service.approveBudget(currentUser, 'budget-1');
        await expect(act).rejects.toThrow(common_1.BadRequestException);
    });
    it('should throw BUDGET_EMPTY when locking budget with zero total budgeted', async () => {
        budgetsRepository.findByIdInOrg.mockResolvedValue({
            ...baseBudget,
            status: client_1.BudgetStatus.APPROVED,
            budget_lines: [
                {
                    ...baseBudget.budget_lines[0],
                    amount_budget: new client_1.Prisma.Decimal('0'),
                },
            ],
        });
        const act = service.lockBudget(currentUser, 'budget-1');
        await expect(act).rejects.toThrow(common_1.BadRequestException);
    });
    it('should throw REJECTION_COMMENT_REQUIRED when comment is empty', async () => {
        budgetsRepository.findByIdInOrg.mockResolvedValue({ ...baseBudget, status: client_1.BudgetStatus.SUBMITTED });
        const act = service.rejectBudget(currentUser, 'budget-1', { rejection_comment: '   ' });
        await expect(act).rejects.toThrow(common_1.BadRequestException);
    });
    it('should publish calc-queue job when budget is approved', async () => {
        budgetsRepository.findByIdInOrg
            .mockResolvedValueOnce({ ...baseBudget, status: client_1.BudgetStatus.SUBMITTED })
            .mockResolvedValueOnce({ ...baseBudget, status: client_1.BudgetStatus.APPROVED });
        await service.approveBudget(currentUser, 'budget-1');
        expect(calcQueue.add).toHaveBeenCalled();
    });
    it('should restrict CONTRIBUTEUR to own department lines only', async () => {
        const contributeur = {
            ...currentUser,
            role: enums_1.UserRole.CONTRIBUTEUR,
            department_scope: [{ department: 'VENTES', can_read: true, can_write: true }],
        };
        budgetsRepository.findByIdInOrg.mockResolvedValue(baseBudget);
        budgetsRepository.getContributorDepartments.mockResolvedValue(['VENTES']);
        budgetsRepository.upsertBudgetLines.mockResolvedValue();
        const act = service.updateLines(contributeur, 'budget-1', {
            lines: [
                {
                    period_id: 'period-1',
                    account_code: '701000',
                    account_label: 'Ventes',
                    department: 'RH',
                    line_type: client_1.LineType.REVENUE,
                    amount_budget: '1000.00',
                },
            ],
        });
        await expect(act).rejects.toThrow(common_1.NotFoundException);
    });
    it('should return 404 when budget belongs to different org', async () => {
        budgetsRepository.findByIdInOrg.mockResolvedValue(null);
        const act = service.getBudgetById(currentUser, 'budget-other-org');
        await expect(act).rejects.toThrow(common_1.NotFoundException);
    });
    it('should serialize amounts as Decimal string never float', async () => {
        budgetsRepository.findByIdInOrg.mockResolvedValue(baseBudget);
        const result = await service.getBudgetById(currentUser, 'budget-1');
        expect(typeof result.lines[0].amount_budget).toBe('string');
        expect(typeof result.lines[0].amount_actual).toBe('string');
        expect(typeof result.lines[0].variance).toBe('string');
    });
    it('should create audit_log on every status transition', async () => {
        budgetsRepository.findByIdInOrg
            .mockResolvedValueOnce({ ...baseBudget, status: client_1.BudgetStatus.DRAFT })
            .mockResolvedValueOnce({ ...baseBudget, status: client_1.BudgetStatus.SUBMITTED });
        budgetsRepository.setStatus.mockResolvedValue();
        await service.submitBudget(currentUser, 'budget-1', '127.0.0.1');
        expect(auditService.createLog).toHaveBeenCalled();
    });
});
//# sourceMappingURL=budgets.service.spec.js.map