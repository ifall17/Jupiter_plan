"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DashboardService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = exports.SnapshotsRepository = exports.AlertsRepository = exports.KpisRepository = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const business_constants_1 = require("../../common/constants/business.constants");
const prisma_service_1 = require("../../prisma/prisma.service");
const redis_service_1 = require("../../redis/redis.service");
let KpisRepository = class KpisRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findValuesByPeriod(orgId, periodId) {
        const values = await this.prisma.kpiValue.findMany({
            where: {
                org_id: orgId,
                period_id: periodId,
                scenario_id: null,
                kpi: { is_active: true },
            },
            include: { kpi: true },
            orderBy: [{ severity: 'desc' }, { calculated_at: 'desc' }],
        });
        return values.map((value) => ({
            kpi_id: value.kpi_id,
            kpi_code: value.kpi.code,
            kpi_label: value.kpi.label,
            unit: value.kpi.unit,
            period_id: value.period_id,
            scenario_id: value.scenario_id,
            value: value.value.toString(),
            severity: value.severity,
            calculated_at: value.calculated_at,
        }));
    }
    async findRevenueTrend3(orgId, fiscalYearId) {
        const snapshots = await this.prisma.financialSnapshot.findMany({
            where: {
                org_id: orgId,
                scenario_id: null,
                period: { fiscal_year_id: fiscalYearId },
            },
            include: { period: true },
            orderBy: { period: { period_number: 'desc' } },
            take: 3,
        });
        return snapshots
            .map((snapshot) => ({
            period_label: snapshot.period.label,
            value: snapshot.is_revenue.toString(),
        }))
            .reverse();
    }
};
exports.KpisRepository = KpisRepository;
exports.KpisRepository = KpisRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], KpisRepository);
let AlertsRepository = class AlertsRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async countUnread(orgId, periodId) {
        return this.prisma.alert.count({
            where: {
                org_id: orgId,
                period_id: periodId,
                is_read: false,
            },
        });
    }
    async findUnreadTop5(orgId, periodId) {
        const alerts = await this.prisma.alert.findMany({
            where: {
                org_id: orgId,
                period_id: periodId,
                is_read: false,
            },
            include: { kpi: true },
            take: 5,
        });
        return alerts
            .sort((a, b) => {
            const severityDiff = this.getSeverityRank(b.severity) - this.getSeverityRank(a.severity);
            if (severityDiff !== 0) {
                return severityDiff;
            }
            return b.created_at.getTime() - a.created_at.getTime();
        })
            .map((alert) => ({
            id: alert.id,
            kpi_id: alert.kpi_id,
            kpi_code: alert.kpi.code,
            kpi_label: alert.kpi.label,
            period_id: alert.period_id,
            severity: alert.severity,
            message: alert.message,
            is_read: alert.is_read,
            created_at: alert.created_at,
        }));
    }
    getSeverityRank(severity) {
        if (severity === client_1.AlertSeverity.CRITICAL) {
            return 3;
        }
        if (severity === client_1.AlertSeverity.WARN) {
            return 2;
        }
        return 1;
    }
};
exports.AlertsRepository = AlertsRepository;
exports.AlertsRepository = AlertsRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AlertsRepository);
let SnapshotsRepository = class SnapshotsRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findSummary(orgId, periodId) {
        const snapshot = await this.prisma.financialSnapshot.findFirst({
            where: {
                org_id: orgId,
                period_id: periodId,
                scenario_id: null,
            },
            orderBy: { calculated_at: 'desc' },
        });
        if (!snapshot) {
            return {
                revenue: new client_1.Prisma.Decimal('0'),
                expenses: new client_1.Prisma.Decimal('0'),
                ebitda: new client_1.Prisma.Decimal('0'),
                net: new client_1.Prisma.Decimal('0'),
            };
        }
        return {
            revenue: snapshot.is_revenue,
            expenses: snapshot.is_expenses,
            ebitda: snapshot.is_ebitda,
            net: snapshot.is_net,
        };
    }
    async findVariancePct(orgId, periodId) {
        const aggregate = await this.prisma.budgetLine.aggregate({
            where: {
                org_id: orgId,
                period_id: periodId,
            },
            _sum: {
                amount_budget: true,
                amount_actual: true,
            },
        });
        const budget = aggregate._sum.amount_budget ?? new client_1.Prisma.Decimal('0');
        const actual = aggregate._sum.amount_actual ?? new client_1.Prisma.Decimal('0');
        if (budget.eq(new client_1.Prisma.Decimal('0'))) {
            return '0.00';
        }
        const variance = actual.minus(budget).div(budget).mul(new client_1.Prisma.Decimal('100'));
        return variance.toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP).toString();
    }
    async findRunwayWeeks(orgId) {
        const [plans, cash] = await this.prisma.$transaction([
            this.prisma.cashFlowPlan.findMany({
                where: { org_id: orgId },
                select: { outflow: true },
            }),
            this.prisma.bankAccount.aggregate({
                where: {
                    org_id: orgId,
                    is_active: true,
                },
                _sum: { balance: true },
            }),
        ]);
        if (plans.length === 0) {
            return 0;
        }
        const burn = plans.reduce((sum, plan) => sum.plus(plan.outflow), new client_1.Prisma.Decimal('0'));
        const avgBurn = burn.div(new client_1.Prisma.Decimal(plans.length.toString()));
        if (avgBurn.lte(new client_1.Prisma.Decimal('0'))) {
            return 0;
        }
        const cashBalance = cash._sum.balance ?? new client_1.Prisma.Decimal('0');
        return Number(cashBalance.div(avgBurn).toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP));
    }
};
exports.SnapshotsRepository = SnapshotsRepository;
exports.SnapshotsRepository = SnapshotsRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SnapshotsRepository);
let DashboardService = DashboardService_1 = class DashboardService {
    constructor(prisma, redisService, kpisRepository, alertsRepository, snapshotsRepository) {
        this.prisma = prisma;
        this.redisService = redisService;
        this.kpisRepository = kpisRepository;
        this.alertsRepository = alertsRepository;
        this.snapshotsRepository = snapshotsRepository;
        this.logger = new common_1.Logger(DashboardService_1.name);
    }
    async getDashboard(currentUser, periodId) {
        const startedAt = Date.now();
        const period = await this.resolvePeriod(currentUser.org_id, periodId);
        const cacheKey = this.buildCacheKey(currentUser.org_id, period.id);
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            this.logger.log(`Dashboard cache HIT - org: ${currentUser.org_id} (${Date.now() - startedAt}ms)`);
            return JSON.parse(cached);
        }
        const [kpis, alertsUnread, alerts, summary, variancePct, runwayWeeks, caTrend] = await Promise.all([
            this.kpisRepository.findValuesByPeriod(currentUser.org_id, period.id),
            this.alertsRepository.countUnread(currentUser.org_id, period.id),
            this.alertsRepository.findUnreadTop5(currentUser.org_id, period.id),
            this.snapshotsRepository.findSummary(currentUser.org_id, period.id),
            this.snapshotsRepository.findVariancePct(currentUser.org_id, period.id),
            this.snapshotsRepository.findRunwayWeeks(currentUser.org_id),
            this.kpisRepository.findRevenueTrend3(currentUser.org_id, period.fiscal_year_id),
        ]);
        const ebitdaMargin = summary.revenue.eq(new client_1.Prisma.Decimal('0'))
            ? new client_1.Prisma.Decimal('0')
            : summary.ebitda.div(summary.revenue).mul(new client_1.Prisma.Decimal('100'));
        const payload = {
            period: {
                id: period.id,
                label: period.label,
                status: period.status,
            },
            kpis,
            alerts_unread: alertsUnread,
            alerts,
            is_summary: {
                revenue: summary.revenue.toString(),
                expenses: summary.expenses.toString(),
                ebitda: summary.ebitda.toString(),
                net: summary.net.toString(),
                ebitda_margin: ebitdaMargin.toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP).toString(),
            },
            variance_pct: variancePct,
            runway_weeks: runwayWeeks,
            ca_trend: caTrend,
        };
        await this.redisService.set(cacheKey, JSON.stringify(payload), 'EX', business_constants_1.CACHE_TTL_KPI);
        this.logger.log(`Dashboard cache MISS - org: ${currentUser.org_id} (${Date.now() - startedAt}ms)`);
        return payload;
    }
    async invalidateCacheAfterCalcDone(orgId, periodId) {
        await this.invalidatePeriodCache(orgId, periodId);
    }
    async invalidateCacheAfterTransactionValidation(orgId, periodId) {
        await this.invalidatePeriodCache(orgId, periodId);
    }
    async invalidateCacheAfterBudgetApproval(orgId, periodId) {
        await this.invalidatePeriodCache(orgId, periodId);
    }
    async invalidateCacheAfterPeriodClose(orgId, periodId) {
        await this.invalidatePeriodCache(orgId, periodId);
    }
    async invalidatePeriodCache(orgId, periodId) {
        await this.redisService.del(this.buildCacheKey(orgId, periodId));
    }
    async resolvePeriod(orgId, periodId) {
        const period = periodId
            ? await this.prisma.period.findFirst({
                where: { id: periodId, org_id: orgId },
                select: { id: true, fiscal_year_id: true, label: true, status: true },
            })
            : await this.prisma.period.findFirst({
                where: { org_id: orgId, status: client_1.PeriodStatus.OPEN },
                select: { id: true, fiscal_year_id: true, label: true, status: true },
                orderBy: { period_number: 'desc' },
            });
        if (!period) {
            throw new common_1.NotFoundException();
        }
        return period;
    }
    buildCacheKey(orgId, periodId) {
        return `dashboard:${orgId}:${periodId}`;
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = DashboardService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        KpisRepository,
        AlertsRepository,
        SnapshotsRepository])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map