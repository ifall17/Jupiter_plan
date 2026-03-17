"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const dashboard_service_1 = require("./dashboard.service");
describe('DashboardService', () => {
    let service;
    let prisma;
    let redis;
    let kpisRepository;
    let alertsRepository;
    let snapshotsRepository;
    const currentUser = {
        sub: 'user-1',
        org_id: 'org-1',
        role: enums_1.UserRole.FPA,
        email: 'fpa@diallo.sn',
    };
    beforeEach(() => {
        prisma = {
            period: {
                findFirst: jest.fn(),
            },
        };
        redis = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
        };
        kpisRepository = {
            findValuesByPeriod: jest.fn(),
            findRevenueTrend3: jest.fn(),
        };
        alertsRepository = {
            countUnread: jest.fn(),
            findUnreadTop5: jest.fn(),
        };
        snapshotsRepository = {
            findSummary: jest.fn(),
            findVariancePct: jest.fn(),
            findVarianceByReferenceBudget: jest.fn(),
            findRunwayWeeks: jest.fn(),
        };
        service = new dashboard_service_1.DashboardService(prisma, redis, kpisRepository, alertsRepository, snapshotsRepository);
        prisma.period.findFirst.mockResolvedValue({
            id: 'period-1',
            fiscal_year_id: 'fy-1',
            label: 'P1',
            status: client_1.PeriodStatus.OPEN,
        });
        kpisRepository.findValuesByPeriod.mockResolvedValue([
            {
                kpi_id: 'k1',
                kpi_code: 'MARGIN',
                kpi_label: 'Margin',
                unit: '%',
                period_id: 'period-1',
                scenario_id: null,
                value: '25.40',
                severity: 'WARN',
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
                severity: 'CRITICAL',
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
                severity: 'WARN',
                message: 'warn alert',
                is_read: false,
                created_at: new Date('2026-01-09T00:00:00.000Z'),
            },
        ]);
        snapshotsRepository.findSummary.mockResolvedValue({
            revenue: new client_1.Prisma.Decimal('1000'),
            expenses: new client_1.Prisma.Decimal('700'),
            ebitda: new client_1.Prisma.Decimal('300'),
            net: new client_1.Prisma.Decimal('180'),
        });
        snapshotsRepository.findVariancePct.mockResolvedValue('5.23');
        snapshotsRepository.findVarianceByReferenceBudget.mockResolvedValue([]);
        snapshotsRepository.findRunwayWeeks.mockResolvedValue(8.5);
    });
    it('should return cached dashboard on second call', async () => {
        redis.get
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(JSON.stringify({
            period: { id: 'period-1', label: 'P1', status: client_1.PeriodStatus.OPEN },
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
            variance_pct: '0',
            runway_weeks: 0,
            ca_trend: [],
        }));
        await service.getDashboard(currentUser, 'period-1');
        const second = await service.getDashboard(currentUser, 'period-1');
        expect(second.period.id).toBe('period-1');
        expect(kpisRepository.findValuesByPeriod).toHaveBeenCalledTimes(1);
    });
    it('should invalidate cache after transaction validation', async () => {
        redis.del.mockResolvedValue(1);
        await service.invalidateCacheAfterTransactionValidation('org-1', 'period-1');
        expect(redis.del).toHaveBeenCalledWith('dashboard:org-1:period-1');
    });
    it('should aggregate all dashboard data in single response', async () => {
        redis.get.mockResolvedValue(null);
        redis.set.mockResolvedValue('OK');
        const result = await service.getDashboard(currentUser, 'period-1');
        expect(result.kpis.length).toBe(1);
        expect(result.alerts_unread).toBe(3);
        expect(result.alerts.length).toBe(2);
        expect(result.ca_trend.length).toBe(3);
    });
    it('should scope cache key with org_id never global', async () => {
        redis.get.mockResolvedValue(null);
        redis.set.mockResolvedValue('OK');
        await service.getDashboard(currentUser, 'period-1');
        expect(redis.set).toHaveBeenCalledWith('dashboard:org-1:period-1', expect.any(String), 'EX', 300);
    });
    it('should return alerts sorted by severity then date', async () => {
        redis.get.mockResolvedValue(null);
        redis.set.mockResolvedValue('OK');
        const result = await service.getDashboard(currentUser, 'period-1');
        expect(result.alerts[0].severity).toBe('CRITICAL');
        expect(result.alerts[1].severity).toBe('WARN');
    });
    it('should serialize all financial amounts as Decimal string', async () => {
        redis.get.mockResolvedValue(null);
        redis.set.mockResolvedValue('OK');
        const result = await service.getDashboard(currentUser, 'period-1');
        expect(typeof result.is_summary.revenue).toBe('string');
        expect(typeof result.is_summary.expenses).toBe('string');
        expect(typeof result.is_summary.ebitda).toBe('string');
        expect(typeof result.is_summary.net).toBe('string');
        expect(Array.isArray(result.variance_pct)).toBe(true);
        expect(typeof result.ca_trend[0].value).toBe('string');
    });
});
//# sourceMappingURL=dashboard.service.spec.js.map