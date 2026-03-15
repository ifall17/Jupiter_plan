"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const cash_flow_service_1 = require("./cash-flow.service");
describe('CashFlowService', () => {
    let service;
    let repository;
    const currentUser = {
        sub: 'user-1',
        org_id: 'org-1',
        role: enums_1.UserRole.FPA,
        email: 'fpa@diallo.sn',
    };
    const plan = {
        id: 'plan-1',
        org_id: 'org-1',
        period_id: 'period-1',
        week_number: 1,
        label: 'Semaine 1',
        inflow: new client_1.Prisma.Decimal('1000'),
        outflow: new client_1.Prisma.Decimal('250'),
        balance: new client_1.Prisma.Decimal('750'),
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
        };
        service = new cash_flow_service_1.CashFlowService(repository);
    });
    it('should calculate runway_weeks correctly', async () => {
        repository.totalActiveCash.mockResolvedValue(new client_1.Prisma.Decimal('800'));
        repository.findByPeriodAndWeek.mockResolvedValue(null);
        repository.create.mockResolvedValue({ ...plan, runway_weeks: 3.2 });
        const result = await service.createOrUpdatePlan(currentUser, {
            period_id: 'period-1',
            week_number: 1,
            label: 'W1',
            inflow: '1000',
            outflow: '250',
        });
        expect(result.runway_weeks).toBe(3.2);
    });
    it('should return CRITICAL severity when runway below 4 weeks', async () => {
        repository.findRollingPlans.mockResolvedValue([{ ...plan, outflow: new client_1.Prisma.Decimal('400') }]);
        repository.totalActiveCash.mockResolvedValue(new client_1.Prisma.Decimal('1000'));
        const runway = await service.getRunwayStatus(currentUser);
        expect(runway.severity).toBe('CRITICAL');
    });
    it('should calculate balance as inflow minus outflow', async () => {
        repository.totalActiveCash.mockResolvedValue(new client_1.Prisma.Decimal('1000'));
        repository.findByPeriodAndWeek.mockResolvedValue(null);
        repository.create.mockImplementation(async (payload) => ({ ...plan, ...payload }));
        const result = await service.createOrUpdatePlan(currentUser, {
            period_id: 'period-1',
            week_number: 1,
            label: 'W1',
            inflow: '700',
            outflow: '200',
        });
        expect(result.balance).toBe('500');
    });
    it('should serialize all amounts as Decimal string', async () => {
        repository.findRollingPlans.mockResolvedValue([plan]);
        const result = await service.listRollingPlan({ currentUser });
        expect(typeof result[0].inflow).toBe('string');
        expect(typeof result[0].outflow).toBe('string');
        expect(typeof result[0].balance).toBe('string');
    });
});
//# sourceMappingURL=cash-flow.service.spec.js.map