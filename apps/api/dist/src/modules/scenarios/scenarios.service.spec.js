"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const business_constants_1 = require("../../common/constants/business.constants");
const scenarios_service_1 = require("./scenarios.service");
describe('ScenariosService', () => {
    let service;
    let repository;
    let auditService;
    let calcQueue;
    const currentUser = {
        sub: 'user-1',
        org_id: 'org-1',
        role: enums_1.UserRole.FPA,
        email: 'fpa@diallo.sn',
    };
    const draftScenario = {
        id: 'scenario-1',
        org_id: 'org-1',
        budget_id: 'budget-1',
        name: 'Base Scenario',
        type: client_1.ScenarioType.BASE,
        status: client_1.ScenarioStatus.DRAFT,
        calculation_mode: 'GLOBAL',
        created_at: new Date(),
        hypotheses: [
            {
                id: 'hyp-1',
                label: 'Revenue growth',
                parameter: 'REVENUE_GROWTH',
                value: new client_1.Prisma.Decimal('5.25'),
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
        };
        auditService = {
            createLog: jest.fn(),
        };
        calcQueue = {
            add: jest.fn(),
        };
        service = new scenarios_service_1.ScenariosService(repository, auditService, calcQueue);
    });
    it('should reject create when budget is not APPROVED', async () => {
        repository.isBudgetApproved.mockResolvedValue(false);
        await expect(service.createScenario(currentUser, {
            budget_id: 'budget-1',
            name: 'Scenario',
            type: client_1.ScenarioType.BASE,
        })).rejects.toBeInstanceOf(common_1.BadRequestException);
    });
    it('should hide hypotheses for LECTEUR role', async () => {
        repository.findByIdInOrg.mockResolvedValue({ ...draftScenario, status: client_1.ScenarioStatus.SAVED });
        const result = await service.getScenarioById({ ...currentUser, role: enums_1.UserRole.LECTEUR }, draftScenario.id);
        expect(result.hypotheses).toBeNull();
    });
    it('should enforce max comparison size fail-secure', async () => {
        const scenarioIds = Array.from({ length: business_constants_1.MAX_SCENARIO_COMPARE + 1 }, (_, idx) => `s-${idx + 1}`);
        await expect(service.compareScenarios(currentUser, { scenario_ids: scenarioIds })).rejects.toBeInstanceOf(common_1.BadRequestException);
    });
    it('should save only when scenario status is CALCULATED', async () => {
        repository.findByIdInOrg.mockResolvedValueOnce(draftScenario);
        await expect(service.saveScenario(currentUser, draftScenario.id)).rejects.toBeInstanceOf(common_1.BadRequestException);
    });
    it('should write SCENARIO_SAVE audit log on save transition', async () => {
        const calculatedScenario = { ...draftScenario, status: client_1.ScenarioStatus.CALCULATED };
        const savedScenario = { ...calculatedScenario, status: client_1.ScenarioStatus.SAVED };
        repository.findByIdInOrg
            .mockResolvedValueOnce(calculatedScenario)
            .mockResolvedValueOnce(savedScenario);
        repository.updateStatus.mockResolvedValue(undefined);
        await service.saveScenario(currentUser, calculatedScenario.id, '127.0.0.1');
        expect(auditService.createLog).toHaveBeenCalledWith(expect.objectContaining({
            action: enums_1.AuditAction.SCENARIO_SAVE,
            entity_type: 'SCENARIO',
            entity_id: calculatedScenario.id,
        }));
    });
    it('should block delete when scenario is referenced in report', async () => {
        repository.findByIdInOrg.mockResolvedValue(draftScenario);
        repository.isReferencedInReport.mockResolvedValue(true);
        await expect(service.deleteScenario(currentUser, draftScenario.id)).rejects.toBeInstanceOf(common_1.BadRequestException);
    });
    it('should calculate snapshot for DRAFT scenario', async () => {
        repository.findByIdInOrg.mockResolvedValue(draftScenario);
        repository.calculateSnapshotFromBudget.mockResolvedValue({
            period_id: 'period-1',
            is_revenue: new client_1.Prisma.Decimal('1000'),
            is_expenses: new client_1.Prisma.Decimal('800'),
            is_ebitda: new client_1.Prisma.Decimal('200'),
            is_net: new client_1.Prisma.Decimal('160'),
            bs_assets: new client_1.Prisma.Decimal('600'),
            bs_liabilities: new client_1.Prisma.Decimal('300'),
            bs_equity: new client_1.Prisma.Decimal('300'),
            cf_operating: new client_1.Prisma.Decimal('180'),
            cf_investing: new client_1.Prisma.Decimal('-50'),
            cf_financing: new client_1.Prisma.Decimal('0'),
        });
        const result = await service.calculateScenario(currentUser, draftScenario.id);
        expect(repository.calculateSnapshotFromBudget).toHaveBeenCalledWith(expect.objectContaining({
            scenarioId: draftScenario.id,
            orgId: currentUser.org_id,
            budgetId: draftScenario.budget_id,
            calculationMode: 'GLOBAL',
        }));
        expect(repository.updateCalculationMode).toHaveBeenCalledWith(draftScenario.id, currentUser.org_id, 'GLOBAL');
        expect(repository.upsertScenarioSnapshot).toHaveBeenCalled();
        expect(result).toEqual({ scenario_id: draftScenario.id, status: 'PROCESSING' });
    });
    it('should throw NotFoundException when scenario is missing', async () => {
        repository.findByIdInOrg.mockResolvedValue(null);
        await expect(service.getScenarioById(currentUser, 'missing')).rejects.toBeInstanceOf(common_1.NotFoundException);
    });
});
//# sourceMappingURL=scenarios.service.spec.js.map