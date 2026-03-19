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
    async findValuesByPeriods(orgId, periodIds) {
        if (periodIds.length === 0)
            return [];
        const additive = new Set(['CA', 'EBITDA', 'CHARGES', 'OPEX']);
        const values = await this.prisma.kpiValue.findMany({
            where: {
                org_id: orgId,
                period_id: { in: periodIds },
                scenario_id: null,
                kpi: { is_active: true },
            },
            include: { kpi: true },
            orderBy: { calculated_at: 'asc' },
        });
        const byCode = new Map();
        for (const v of values) {
            const arr = byCode.get(v.kpi.code) ?? [];
            arr.push(v);
            byCode.set(v.kpi.code, arr);
        }
        const result = [];
        for (const [code, kpiVals] of byCode.entries()) {
            const latest = kpiVals[kpiVals.length - 1];
            const aggregatedValue = additive.has(code)
                ? kpiVals.reduce((s, v) => s.plus(v.value), new client_1.Prisma.Decimal(0))
                : latest.value;
            result.push({
                kpi_id: latest.kpi_id,
                kpi_code: code,
                kpi_label: latest.kpi.label,
                unit: latest.kpi.unit,
                period_id: 'YTD',
                scenario_id: null,
                value: aggregatedValue.toDecimalPlaces(2).toString(),
                severity: latest.severity,
                calculated_at: latest.calculated_at,
            });
        }
        const ca = result.find((r) => r.kpi_code === 'CA');
        const ebitda = result.find((r) => r.kpi_code === 'EBITDA');
        const marge = result.find((r) => r.kpi_code === 'MARGE_EBITDA' || r.kpi_code === 'MARGE');
        if (ca && ebitda && marge) {
            const caDecimal = new client_1.Prisma.Decimal(ca.value);
            if (!caDecimal.eq(0)) {
                marge.value = new client_1.Prisma.Decimal(ebitda.value)
                    .div(caDecimal)
                    .mul(100)
                    .toDecimalPlaces(2)
                    .toString();
            }
        }
        return result.sort((a, b) => {
            const rank = { CRITICAL: 3, WARN: 2, INFO: 1 };
            return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
        });
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
    async countUnreadYTD(orgId, periodIds) {
        if (periodIds.length === 0)
            return 0;
        return this.prisma.alert.count({
            where: { org_id: orgId, period_id: { in: periodIds }, is_read: false },
        });
    }
    async findUnreadTop5YTD(orgId, periodIds) {
        if (periodIds.length === 0)
            return [];
        const alerts = await this.prisma.alert.findMany({
            where: { org_id: orgId, period_id: { in: periodIds }, is_read: false },
            include: { kpi: true },
            take: 5,
            orderBy: [{ severity: 'desc' }, { created_at: 'desc' }],
        });
        return alerts.map((alert) => ({
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
    async findVarianceByReferenceBudget(orgId, periodId, fiscalYearId) {
        const referenceBudget = await this.prisma.budget.findFirst({
            where: {
                org_id: orgId,
                fiscal_year_id: fiscalYearId,
                is_reference: true,
                status: client_1.BudgetStatus.LOCKED,
            },
            include: {
                budget_lines: {
                    where: { period_id: periodId },
                },
            },
        });
        if (!referenceBudget || referenceBudget.budget_lines.length === 0) {
            return [];
        }
        const groups = new Map();
        for (const line of referenceBudget.budget_lines) {
            const key = line.account_label;
            const existing = groups.get(key) ?? {
                budgeted: new client_1.Prisma.Decimal(0),
                actual: new client_1.Prisma.Decimal(0),
            };
            groups.set(key, {
                budgeted: existing.budgeted.plus(line.amount_budget),
                actual: existing.actual.plus(line.amount_actual),
            });
        }
        return Array.from(groups.entries()).map(([line_label, { budgeted, actual }]) => {
            const variancePct = budgeted.eq(new client_1.Prisma.Decimal(0))
                ? '0.00'
                : actual
                    .minus(budgeted)
                    .div(budgeted)
                    .mul(100)
                    .toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP)
                    .toString();
            return {
                line_label,
                budgeted: budgeted.toString(),
                actual: actual.toString(),
                variance_pct: variancePct,
            };
        });
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
            return '0.00';
        }
        const burn = plans.reduce((sum, plan) => sum.plus(plan.outflow), new client_1.Prisma.Decimal('0'));
        const avgBurn = burn.div(new client_1.Prisma.Decimal(plans.length.toString()));
        if (avgBurn.lte(new client_1.Prisma.Decimal('0'))) {
            return '0.00';
        }
        const cashBalance = cash._sum.balance ?? new client_1.Prisma.Decimal('0');
        return cashBalance.div(avgBurn).toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP).toString();
    }
    async findSummaryYTD(orgId, periodIds) {
        if (periodIds.length === 0) {
            return {
                revenue: new client_1.Prisma.Decimal('0'),
                expenses: new client_1.Prisma.Decimal('0'),
                ebitda: new client_1.Prisma.Decimal('0'),
                net: new client_1.Prisma.Decimal('0'),
            };
        }
        const agg = await this.prisma.financialSnapshot.aggregate({
            where: { org_id: orgId, period_id: { in: periodIds }, scenario_id: null },
            _sum: { is_revenue: true, is_expenses: true, is_ebitda: true, is_net: true },
        });
        return {
            revenue: agg._sum.is_revenue ?? new client_1.Prisma.Decimal('0'),
            expenses: agg._sum.is_expenses ?? new client_1.Prisma.Decimal('0'),
            ebitda: agg._sum.is_ebitda ?? new client_1.Prisma.Decimal('0'),
            net: agg._sum.is_net ?? new client_1.Prisma.Decimal('0'),
        };
    }
    async findVarianceYTD(orgId, periodIds, fiscalYearId) {
        if (periodIds.length === 0)
            return [];
        const referenceBudget = await this.prisma.budget.findFirst({
            where: { org_id: orgId, fiscal_year_id: fiscalYearId, is_reference: true, status: client_1.BudgetStatus.LOCKED },
            include: { budget_lines: { where: { period_id: { in: periodIds } } } },
        });
        if (!referenceBudget || referenceBudget.budget_lines.length === 0)
            return [];
        const groups = new Map();
        for (const line of referenceBudget.budget_lines) {
            const key = line.account_label;
            const existing = groups.get(key) ?? { budgeted: new client_1.Prisma.Decimal(0), actual: new client_1.Prisma.Decimal(0) };
            groups.set(key, {
                budgeted: existing.budgeted.plus(line.amount_budget),
                actual: existing.actual.plus(line.amount_actual),
            });
        }
        return Array.from(groups.entries()).map(([line_label, { budgeted, actual }]) => {
            const variancePct = budgeted.eq(new client_1.Prisma.Decimal(0))
                ? '0.00'
                : actual.minus(budgeted).div(budgeted).mul(100).toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP).toString();
            return { line_label, budgeted: budgeted.toString(), actual: actual.toString(), variance_pct: variancePct };
        });
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
    async getDashboard(currentUser, periodId, ytd, quarter, fromPeriod, toPeriod) {
        const startedAt = Date.now();
        if (ytd || quarter || (fromPeriod && toPeriod)) {
            return this.getDashboardAggregate(currentUser, startedAt, { ytd, quarter, fromPeriod, toPeriod });
        }
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
            this.snapshotsRepository.findVarianceByReferenceBudget(currentUser.org_id, period.id, period.fiscal_year_id),
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
    async getDashboardAggregate(currentUser, startedAt, params) {
        const selection = await this.resolveAggregatePeriodIds(currentUser.org_id, params);
        if (selection.periodIds.length === 0) {
            throw new common_1.NotFoundException('Aucune période agrégée trouvée');
        }
        const cacheKey = `dashboard:${currentUser.org_id}:AGG:${selection.cacheSuffix}`;
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            this.logger.log(`Dashboard aggregate cache HIT - org: ${currentUser.org_id} (${Date.now() - startedAt}ms)`);
            return JSON.parse(cached);
        }
        const latestPeriod = await this.prisma.period.findFirst({
            where: { id: { in: selection.periodIds } },
            select: { fiscal_year_id: true },
            orderBy: { period_number: 'desc' },
        });
        if (!latestPeriod) {
            throw new common_1.NotFoundException('Aucune période agrégée trouvée');
        }
        const [kpis, alertsUnread, alerts, summary, variancePct, runwayWeeks, caTrend] = await Promise.all([
            this.kpisRepository.findValuesByPeriods(currentUser.org_id, selection.periodIds),
            this.alertsRepository.countUnreadYTD(currentUser.org_id, selection.periodIds),
            this.alertsRepository.findUnreadTop5YTD(currentUser.org_id, selection.periodIds),
            this.snapshotsRepository.findSummaryYTD(currentUser.org_id, selection.periodIds),
            this.snapshotsRepository.findVarianceYTD(currentUser.org_id, selection.periodIds, latestPeriod.fiscal_year_id),
            this.snapshotsRepository.findRunwayWeeks(currentUser.org_id),
            this.kpisRepository.findRevenueTrend3(currentUser.org_id, latestPeriod.fiscal_year_id),
        ]);
        const ebitdaMargin = summary.revenue.eq(new client_1.Prisma.Decimal('0'))
            ? new client_1.Prisma.Decimal('0')
            : summary.ebitda.div(summary.revenue).mul(new client_1.Prisma.Decimal('100'));
        const payload = {
            period: { id: selection.cacheSuffix, label: selection.label, status: client_1.PeriodStatus.OPEN },
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
        this.logger.log(`Dashboard aggregate cache MISS - org: ${currentUser.org_id} (${Date.now() - startedAt}ms)`);
        return payload;
    }
    async resolveAggregatePeriodIds(orgId, params) {
        const activePeriod = await this.prisma.period.findFirst({
            where: { org_id: orgId, status: client_1.PeriodStatus.OPEN },
            select: { fiscal_year_id: true },
            orderBy: { period_number: 'desc' },
        });
        const fiscalYearId = activePeriod?.fiscal_year_id;
        if (!fiscalYearId) {
            return { periodIds: [], label: 'Agrégé', cacheSuffix: 'AGG' };
        }
        if (params.ytd) {
            const currentMonth = new Date().getMonth() + 1;
            const periods = await this.prisma.period.findMany({
                where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { lte: currentMonth } },
                select: { id: true, label: true },
                orderBy: { period_number: 'asc' },
            });
            const first = periods[0];
            const last = periods[periods.length - 1];
            return {
                periodIds: periods.map((p) => p.id),
                label: first && last ? `YTD (${first.label} -> ${last.label})` : 'YTD',
                cacheSuffix: 'YTD',
            };
        }
        if (params.quarter && params.quarter >= 1 && params.quarter <= 4) {
            const start = (params.quarter - 1) * 3 + 1;
            const end = start + 2;
            const periods = await this.prisma.period.findMany({
                where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { gte: start, lte: end } },
                select: { id: true },
                orderBy: { period_number: 'asc' },
            });
            return {
                periodIds: periods.map((p) => p.id),
                label: `T${params.quarter}`,
                cacheSuffix: `Q${params.quarter}`,
            };
        }
        if (params.fromPeriod && params.toPeriod) {
            const bounds = await this.prisma.period.findMany({
                where: {
                    org_id: orgId,
                    id: { in: [params.fromPeriod, params.toPeriod] },
                    fiscal_year_id: fiscalYearId,
                },
                select: { id: true, period_number: true, label: true },
            });
            if (bounds.length < 2) {
                return { periodIds: [], label: 'Plage personnalisée', cacheSuffix: 'CUSTOM' };
            }
            const from = bounds.find((b) => b.id === params.fromPeriod);
            const to = bounds.find((b) => b.id === params.toPeriod);
            if (!from || !to) {
                return { periodIds: [], label: 'Plage personnalisée', cacheSuffix: 'CUSTOM' };
            }
            const min = Math.min(from.period_number, to.period_number);
            const max = Math.max(from.period_number, to.period_number);
            const periods = await this.prisma.period.findMany({
                where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { gte: min, lte: max } },
                select: { id: true },
                orderBy: { period_number: 'asc' },
            });
            return {
                periodIds: periods.map((p) => p.id),
                label: `Plage (${from.label} -> ${to.label})`,
                cacheSuffix: `CUSTOM:${params.fromPeriod}:${params.toPeriod}`,
            };
        }
        return { periodIds: [], label: 'Agrégé', cacheSuffix: 'AGG' };
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