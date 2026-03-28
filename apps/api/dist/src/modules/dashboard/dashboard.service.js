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
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const rxjs_1 = require("rxjs");
const business_constants_1 = require("../../common/constants/business.constants");
const syscohada_mapping_service_1 = require("../../common/services/syscohada-mapping.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const redis_service_1 = require("../../redis/redis.service");
let KpisRepository = class KpisRepository {
    constructor(prisma, httpService, config) {
        this.prisma = prisma;
        this.httpService = httpService;
        this.config = config;
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
            category: value.kpi.category,
            description: value.kpi.description,
            unit: value.kpi.unit,
            period_id: value.period_id,
            scenario_id: value.scenario_id,
            value: value.value.toString(),
            threshold_warn: value.kpi.threshold_warn?.toString() ?? null,
            threshold_critical: value.kpi.threshold_critical?.toString() ?? null,
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
            include: { period: { select: { label: true, period_number: true } } },
            orderBy: [
                { period: { period_number: 'desc' } },
                { calculated_at: 'desc' },
            ],
            distinct: ['period_id'],
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
                category: latest.kpi.category,
                description: latest.kpi.description,
                unit: latest.kpi.unit,
                period_id: 'YTD',
                scenario_id: null,
                value: aggregatedValue.toDecimalPlaces(2).toString(),
                threshold_warn: latest.kpi.threshold_warn?.toString() ?? null,
                threshold_critical: latest.kpi.threshold_critical?.toString() ?? null,
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
        try {
            const calcLines = await this.getCalcIncomeStatementLinesForPeriods(orgId, periodIds);
            if (calcLines) {
                const zero = new client_1.Prisma.Decimal('0');
                const hundred = new client_1.Prisma.Decimal('100');
                const toDecimal = (value) => {
                    if (!value)
                        return zero;
                    try {
                        return new client_1.Prisma.Decimal(value);
                    }
                    catch {
                        return zero;
                    }
                };
                const caCalc = toDecimal(calcLines.XB);
                const ebitdaCalc = toDecimal(calcLines.XD);
                const operatingCalc = toDecimal(calcLines.XE);
                const netCalc = toDecimal(calcLines.XI);
                const achatsCalc = toDecimal(calcLines.RA);
                const chargesCalc = caCalc.minus(ebitdaCalc);
                const ebitdaMarginCalc = caCalc.gt(zero) ? ebitdaCalc.div(caCalc).mul(hundred) : zero;
                const netMarginCalc = caCalc.gt(zero) ? netCalc.div(caCalc).mul(hundred) : zero;
                const operatingMarginCalc = caCalc.gt(zero) ? operatingCalc.div(caCalc).mul(hundred) : zero;
                const grossMarginCalc = caCalc.gt(zero) ? caCalc.minus(achatsCalc).div(caCalc).mul(hundred) : zero;
                const applyOverride = (code, value) => {
                    const entry = result.find((r) => r.kpi_code === code);
                    if (!entry)
                        return;
                    entry.value = value.toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP).toString();
                    const kpiVals = byCode.get(code);
                    if (kpiVals?.length) {
                        entry.severity = this.computeKpiSeverity(kpiVals[0].kpi, value);
                    }
                };
                applyOverride('CA', caCalc);
                applyOverride('EBITDA', ebitdaCalc);
                applyOverride('CHARGES', chargesCalc);
                applyOverride('MARGE', ebitdaMarginCalc);
                applyOverride('MARGE_EBITDA', ebitdaMarginCalc);
                applyOverride('EBITDA_MARGIN', ebitdaMarginCalc);
                applyOverride('NET_MARGIN', netMarginCalc);
                applyOverride('OPERATING_MARGIN', operatingMarginCalc);
                applyOverride('GROSS_MARGIN', grossMarginCalc);
            }
        }
        catch {
        }
        return result.sort((a, b) => {
            const rank = { CRITICAL: 3, WARN: 2, INFO: 1 };
            return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
        });
    }
    computeKpiSeverity(kpi, value) {
        if (kpi.threshold_critical && value.lte(kpi.threshold_critical)) {
            return client_1.AlertSeverity.CRITICAL;
        }
        if (kpi.threshold_warn && value.lte(kpi.threshold_warn)) {
            return client_1.AlertSeverity.WARN;
        }
        return client_1.AlertSeverity.INFO;
    }
    async getCalcIncomeStatementLinesForPeriods(orgId, periodIds) {
        if (periodIds.length === 0)
            return null;
        const [transactions, cashFlowPlans] = await Promise.all([
            this.prisma.transaction.findMany({
                where: {
                    org_id: orgId,
                    period_id: { in: periodIds },
                    is_validated: true,
                },
                select: {
                    account_code: true,
                    account_label: true,
                    department: true,
                    amount: true,
                    is_validated: true,
                    period: { select: { start_date: true } },
                },
            }),
            this.prisma.cashFlowPlan.findMany({
                where: { org_id: orgId, period_id: { in: periodIds } },
                select: {
                    direction: true,
                    amount: true,
                    flow_type: true,
                    label: true,
                    planned_date: true,
                },
            }),
        ]);
        if (transactions.length === 0)
            return null;
        const calcUrl = this.config.get('CALC_ENGINE_URL') ?? this.config.get('calcEngine.url');
        if (!calcUrl) {
            throw new common_1.InternalServerErrorException('CALC_ENGINE_URL is not configured');
        }
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${calcUrl}/reports/financial-statements`, {
            transactions: transactions.map((tx) => ({
                account_code: tx.account_code,
                account_label: tx.account_label,
                department: tx.department,
                line_type: tx.amount.gt(0) ? 'REVENUE' : 'EXPENSE',
                amount: tx.amount.toString(),
                transaction_date: tx.period.start_date.toISOString(),
                is_validated: tx.is_validated,
                label: tx.account_label,
            })),
            cash_flow_plans: cashFlowPlans.map((plan) => ({
                direction: plan.direction,
                amount: plan.amount.toString(),
                flow_type: plan.flow_type,
                label: plan.label,
                planned_date: (plan.planned_date ?? new Date()).toISOString(),
            })),
            snapshot: {},
        }));
        return response.data?.is_data?.lines ?? null;
    }
};
exports.KpisRepository = KpisRepository;
exports.KpisRepository = KpisRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        axios_1.HttpService,
        config_1.ConfigService])
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
    buildActualKey(periodId, accountCode, department) {
        return `${periodId}::${accountCode}::${department}`;
    }
    async getActualsByKey(orgId, periodIds) {
        if (periodIds.length === 0) {
            return new Map();
        }
        const transactions = await this.prisma.transaction.findMany({
            where: {
                org_id: orgId,
                period_id: { in: periodIds },
                is_validated: true,
            },
            select: {
                period_id: true,
                account_code: true,
                department: true,
                amount: true,
            },
        });
        const actualByKey = new Map();
        for (const transaction of transactions) {
            const key = this.buildActualKey(transaction.period_id, transaction.account_code, transaction.department);
            const existing = actualByKey.get(key) ?? new client_1.Prisma.Decimal('0');
            actualByKey.set(key, existing.plus(transaction.amount.abs()));
        }
        return actualByKey;
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
        const lines = await this.prisma.budgetLine.findMany({
            where: {
                org_id: orgId,
                period_id: periodId,
            },
            select: {
                period_id: true,
                account_code: true,
                department: true,
                amount_budget: true,
            },
        });
        const actualByKey = await this.getActualsByKey(orgId, [periodId]);
        const budget = lines.reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
        const actual = lines.reduce((sum, line) => sum.plus(actualByKey.get(this.buildActualKey(line.period_id, line.account_code, line.department)) ?? new client_1.Prisma.Decimal('0')), new client_1.Prisma.Decimal('0'));
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
        const actualByKey = await this.getActualsByKey(orgId, [periodId]);
        const groups = new Map();
        for (const line of referenceBudget.budget_lines) {
            const key = line.account_label;
            const existing = groups.get(key) ?? {
                budgeted: new client_1.Prisma.Decimal(0),
                actual: new client_1.Prisma.Decimal(0),
            };
            groups.set(key, {
                budgeted: existing.budgeted.plus(line.amount_budget),
                actual: existing.actual.plus(actualByKey.get(this.buildActualKey(line.period_id, line.account_code, line.department)) ?? new client_1.Prisma.Decimal('0')),
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
        const actualByKey = await this.getActualsByKey(orgId, periodIds);
        const groups = new Map();
        for (const line of referenceBudget.budget_lines) {
            const key = line.account_label;
            const existing = groups.get(key) ?? { budgeted: new client_1.Prisma.Decimal(0), actual: new client_1.Prisma.Decimal(0) };
            groups.set(key, {
                budgeted: existing.budgeted.plus(line.amount_budget),
                actual: existing.actual.plus(actualByKey.get(this.buildActualKey(line.period_id, line.account_code, line.department)) ?? new client_1.Prisma.Decimal('0')),
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
    buildSummaryFromKpis(summary, kpis) {
        const kpiByCode = new Map(kpis.map((kpi) => [kpi.kpi_code, new client_1.Prisma.Decimal(kpi.value || '0')]));
        const revenue = summary.revenue.eq(0) ? (kpiByCode.get('CA') ?? summary.revenue) : summary.revenue;
        const expenses = summary.expenses.eq(0) ? (kpiByCode.get('CHARGES') ?? summary.expenses) : summary.expenses;
        const ebitda = summary.ebitda.eq(0) ? (kpiByCode.get('EBITDA') ?? summary.ebitda) : summary.ebitda;
        const netFallback = revenue.minus(expenses);
        const net = summary.net.eq(0) ? netFallback : summary.net;
        const ebitdaMargin = revenue.eq(0)
            ? new client_1.Prisma.Decimal(0)
            : ebitda.div(revenue).mul(100);
        return {
            revenue: revenue.toString(),
            expenses: expenses.toString(),
            ebitda: ebitda.toString(),
            net: net.toString(),
            ebitda_margin: ebitdaMargin.toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP).toString(),
        };
    }
    constructor(prisma, redisService, kpisRepository, alertsRepository, snapshotsRepository, httpService, config, syscohadaMappingService) {
        this.prisma = prisma;
        this.redisService = redisService;
        this.kpisRepository = kpisRepository;
        this.alertsRepository = alertsRepository;
        this.snapshotsRepository = snapshotsRepository;
        this.httpService = httpService;
        this.config = config;
        this.syscohadaMappingService = syscohadaMappingService;
        this.logger = new common_1.Logger(DashboardService_1.name);
        this.dashboardCacheVersion = 'v2';
    }
    async getFinancialStatements(orgId, params) {
        let periodIds;
        if (params.period_id) {
            periodIds = [params.period_id];
        }
        else if (params.ytd || params.quarter || (params.from_period && params.to_period)) {
            const { periodIds: resolved } = await this.resolveAggregatePeriodIds(orgId, {
                ytd: params.ytd,
                quarter: params.quarter,
                fromPeriod: params.from_period,
                toPeriod: params.to_period,
            });
            periodIds = resolved;
        }
        else {
            periodIds = [];
        }
        const data = await this.getReportData({ period_id: periodIds[0] }, orgId);
        if (periodIds.length > 1) {
            const transactions = await this.prisma.transaction.findMany({
                where: { org_id: orgId, period_id: { in: periodIds }, is_validated: true },
                select: {
                    account_code: true,
                    account_label: true,
                    department: true,
                    amount: true,
                    is_validated: true,
                    period: { select: { start_date: true } },
                },
                orderBy: { account_code: 'asc' },
            });
            data.transactions = transactions.map((tx) => ({
                account_code: tx.account_code,
                account_label: tx.account_label,
                department: tx.department,
                line_type: tx.amount.gt(0) ? 'REVENUE' : 'EXPENSE',
                amount: tx.amount.toString(),
                transaction_date: tx.period.start_date.toISOString(),
                is_validated: tx.is_validated,
                label: tx.account_label,
            }));
        }
        const calcUrl = this.config.get('CALC_ENGINE_URL') ?? this.config.get('calcEngine.url');
        if (!calcUrl) {
            throw new common_1.InternalServerErrorException('CALC_ENGINE_URL is not configured');
        }
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${calcUrl}/reports/financial-statements`, data));
        return response.data;
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
        const effectiveSummary = this.buildSummaryFromKpis(summary, kpis);
        const payload = {
            period: {
                id: period.id,
                label: period.label,
                status: period.status,
            },
            kpis,
            alerts_unread: alertsUnread,
            alerts,
            is_summary: effectiveSummary,
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
        const cacheKey = `dashboard:${this.dashboardCacheVersion}:${currentUser.org_id}:AGG:${selection.cacheSuffix}`;
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
        const effectiveSummary = this.buildSummaryFromKpis(summary, kpis);
        const payload = {
            period: { id: selection.cacheSuffix, label: selection.label, status: client_1.PeriodStatus.OPEN },
            kpis,
            alerts_unread: alertsUnread,
            alerts,
            is_summary: effectiveSummary,
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
        await Promise.all([
            this.redisService.del(this.buildCacheKey(orgId, periodId)),
            this.redisService.delByPattern(`dashboard:${this.dashboardCacheVersion}:${orgId}:AGG:*`),
        ]);
    }
    async getMonthlyData(orgId) {
        const months = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
        const activeFiscalYear = await this.prisma.fiscalYear.findFirst({
            where: { org_id: orgId, status: 'ACTIVE' },
            select: { id: true },
            orderBy: { start_date: 'desc' },
        });
        if (!activeFiscalYear) {
            return {
                monthly: [],
                expensesByDept: [],
                budgetVsActualByDept: [],
            };
        }
        const periods = await this.prisma.period.findMany({
            where: { fiscal_year_id: activeFiscalYear.id },
            orderBy: { period_number: 'asc' },
            select: { id: true, period_number: true },
        });
        const periodIds = periods.map((period) => period.id);
        const [transactions, expenseTransactions, budgetLines] = await Promise.all([
            this.prisma.transaction.findMany({
                where: { org_id: orgId, period_id: { in: periodIds }, is_validated: true },
                select: { period_id: true, amount: true, department: true },
            }),
            this.prisma.transaction.findMany({
                where: { org_id: orgId, period_id: { in: periodIds }, is_validated: true, amount: { lt: 0 } },
                select: { amount: true, department: true },
            }),
            this.prisma.budgetLine.findMany({
                where: {
                    org_id: orgId,
                    period_id: { in: periodIds },
                    budget: {
                        fiscal_year_id: activeFiscalYear.id,
                        status: { in: [client_1.BudgetStatus.APPROVED, client_1.BudgetStatus.LOCKED] },
                    },
                },
                select: { department: true, amount_budget: true },
            }),
        ]);
        const monthly = periods.map((period) => {
            const periodTx = transactions.filter((tx) => tx.period_id === period.id);
            const revenue = periodTx
                .filter((tx) => tx.amount.gt(0))
                .reduce((sum, tx) => sum.plus(tx.amount), new client_1.Prisma.Decimal(0));
            const expenses = periodTx
                .filter((tx) => tx.amount.lt(0))
                .reduce((sum, tx) => sum.plus(tx.amount.abs()), new client_1.Prisma.Decimal(0));
            return {
                month: months[Math.max(0, period.period_number - 1)] ?? `P${period.period_number}`,
                revenue: Math.round(Number(revenue.toString())),
                expenses: Math.round(Number(expenses.toString())),
                ebitda: Math.round(Number(revenue.minus(expenses).toString())),
            };
        });
        const expensesByDeptMap = new Map();
        for (const tx of expenseTransactions) {
            const dept = tx.department || 'Autre';
            const existing = expensesByDeptMap.get(dept) ?? new client_1.Prisma.Decimal(0);
            expensesByDeptMap.set(dept, existing.plus(tx.amount.abs()));
        }
        const expensesByDept = Array.from(expensesByDeptMap.entries())
            .map(([name, value]) => ({ name, value: Math.round(Number(value.toString())) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
        const budgetByDeptMap = new Map();
        for (const line of budgetLines) {
            const dept = line.department || 'Autre';
            const existing = budgetByDeptMap.get(dept) ?? new client_1.Prisma.Decimal(0);
            budgetByDeptMap.set(dept, existing.plus(line.amount_budget));
        }
        const actualByDeptMap = new Map();
        for (const tx of expenseTransactions) {
            const dept = tx.department || 'Autre';
            const existing = actualByDeptMap.get(dept) ?? new client_1.Prisma.Decimal(0);
            actualByDeptMap.set(dept, existing.plus(tx.amount.abs()));
        }
        const departments = Array.from(new Set([...budgetByDeptMap.keys(), ...actualByDeptMap.keys()]));
        const budgetVsActualByDept = departments
            .map((department) => {
            const budget = budgetByDeptMap.get(department) ?? new client_1.Prisma.Decimal(0);
            const actual = actualByDeptMap.get(department) ?? new client_1.Prisma.Decimal(0);
            return {
                department,
                budget: Math.round(Number(budget.toString())),
                actual: Math.round(Number(actual.toString())),
            };
        })
            .sort((a, b) => b.actual - a.actual)
            .slice(0, 8);
        return {
            monthly,
            expensesByDept,
            budgetVsActualByDept,
        };
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
        return `dashboard:${this.dashboardCacheVersion}:${orgId}:${periodId}`;
    }
    async getReportData(params, orgId) {
        const periodIds = params.period_id
            ? [params.period_id]
            : (await this.prisma.period.findMany({
                where: { org_id: orgId, status: client_1.PeriodStatus.OPEN },
                select: { id: true },
                orderBy: { period_number: 'desc' },
                take: 1,
            })).map((period) => period.id);
        const [transactions, cashFlowPlans] = await Promise.all([
            this.prisma.transaction.findMany({
                where: {
                    org_id: orgId,
                    period_id: { in: periodIds },
                    is_validated: true,
                },
                select: {
                    account_code: true,
                    account_label: true,
                    department: true,
                    amount: true,
                    is_validated: true,
                    period: { select: { start_date: true } },
                },
                orderBy: { account_code: 'asc' },
            }),
            this.prisma.cashFlowPlan.findMany({
                where: { org_id: orgId },
                select: {
                    direction: true,
                    amount: true,
                    flow_type: true,
                    planned_date: true,
                    label: true,
                },
                orderBy: { planned_date: 'asc' },
            }),
        ]);
        const latestSelectedPeriod = periodIds.length
            ? await this.prisma.period.findFirst({
                where: { org_id: orgId, id: { in: periodIds } },
                orderBy: [
                    { fiscal_year: { start_date: 'desc' } },
                    { period_number: 'desc' },
                ],
                select: { id: true },
            })
            : null;
        const latestSnapshot = latestSelectedPeriod
            ? await this.prisma.financialSnapshot.findFirst({
                where: {
                    org_id: orgId,
                    period_id: latestSelectedPeriod.id,
                    scenario_id: null,
                },
                orderBy: { calculated_at: 'desc' },
                select: {
                    is_revenue: true,
                    is_expenses: true,
                    is_net: true,
                    bs_assets: true,
                    bs_liabilities: true,
                    bs_equity: true,
                },
            })
            : null;
        const resolvedLineTypes = await this.syscohadaMappingService.resolveReportLineTypes(orgId, transactions.map((transaction) => ({
            accountCode: transaction.account_code,
            amount: transaction.amount.toString(),
        })));
        return {
            transactions: transactions.map((transaction, index) => ({
                account_code: transaction.account_code,
                account_label: transaction.account_label,
                department: transaction.department,
                line_type: resolvedLineTypes[index],
                amount: transaction.amount.toString(),
                transaction_date: (transaction.period?.start_date ?? new Date()).toISOString(),
                is_validated: transaction.is_validated,
                label: transaction.account_label,
            })),
            cash_flow_plans: cashFlowPlans.map((plan) => ({
                direction: plan.direction,
                amount: plan.amount.toString(),
                flow_type: plan.flow_type,
                label: plan.label,
                planned_date: (plan.planned_date ?? new Date()).toISOString(),
            })),
            snapshot: {
                is_revenue: latestSnapshot?.is_revenue.toString() ?? '0',
                is_expenses: latestSnapshot?.is_expenses.toString() ?? '0',
                is_net: latestSnapshot?.is_net.toString() ?? '0',
                bs_assets: latestSnapshot?.bs_assets.toString() ?? '0',
                bs_liabilities: latestSnapshot?.bs_liabilities.toString() ?? '0',
                bs_equity: latestSnapshot?.bs_equity.toString() ?? '0',
            },
        };
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = DashboardService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        KpisRepository,
        AlertsRepository,
        SnapshotsRepository,
        axios_1.HttpService,
        config_1.ConfigService,
        syscohada_mapping_service_1.SyscohadaMappingService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map