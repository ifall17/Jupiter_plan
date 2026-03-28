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
var KpisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KpisService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const business_constants_1 = require("../../common/constants/business.constants");
const syscohada_financial_mapping_1 = require("../../common/constants/syscohada-financial-mapping");
const calc_engine_client_1 = require("../../common/services/calc-engine.client");
const prisma_service_1 = require("../../prisma/prisma.service");
const redis_service_1 = require("../../redis/redis.service");
const TAUX_IS_SENEGAL = 0.30;
let KpisService = KpisService_1 = class KpisService {
    constructor(prisma, redisService, calcEngineClient) {
        this.prisma = prisma;
        this.redisService = redisService;
        this.calcEngineClient = calcEngineClient;
        this.logger = new common_1.Logger(KpisService_1.name);
    }
    async listActiveKpis(currentUser) {
        const kpis = await this.prisma.kpi.findMany({
            where: {
                org_id: currentUser.org_id,
                is_active: true,
            },
            orderBy: { code: 'asc' },
        });
        return kpis.map((kpi) => ({
            id: kpi.id,
            code: kpi.code,
            label: kpi.label,
            formula: kpi.formula,
            unit: kpi.unit,
            category: kpi.category,
            description: kpi.description,
            threshold_warn: kpi.threshold_warn?.toString() ?? null,
            threshold_critical: kpi.threshold_critical?.toString() ?? null,
            is_active: kpi.is_active,
        }));
    }
    async getValues(currentUser, periodId, scenarioId, ytd, quarter, fromPeriod, toPeriod) {
        const resolution = await this.resolvePeriodIds(currentUser.org_id, {
            periodId,
            ytd,
            quarter,
            fromPeriod,
            toPeriod,
        });
        if (resolution.periodIds.length === 0) {
            return [];
        }
        if (resolution.mode === 'single') {
            const targetPeriodId = resolution.periodIds[0];
            const cacheKey = this.buildCacheKey(currentUser.org_id, targetPeriodId, scenarioId);
            const cached = await this.redisService.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
            const values = await this.prisma.kpiValue.findMany({
                where: {
                    org_id: currentUser.org_id,
                    period_id: targetPeriodId,
                    ...(scenarioId ? { scenario_id: scenarioId } : { scenario_id: null }),
                    kpi: { is_active: true },
                },
                include: { kpi: true },
                orderBy: [{ severity: 'desc' }, { calculated_at: 'desc' }],
            });
            const response = values.map((value) => this.toValueResponse(value));
            await this.redisService.set(cacheKey, JSON.stringify(response), 'EX', business_constants_1.CACHE_TTL_KPI);
            return response;
        }
        return this.getValuesAggregated(currentUser, resolution.periodIds, resolution.virtualPeriodId);
    }
    async getTrend(currentUser, kpiCode, fiscalYearId) {
        const periods = await this.prisma.period.findMany({
            where: {
                org_id: currentUser.org_id,
                fiscal_year_id: fiscalYearId,
            },
            select: { id: true, label: true, period_number: true },
            orderBy: { period_number: 'desc' },
            take: 12,
        });
        if (periods.length === 0) {
            return { kpi_code: kpiCode, values: [] };
        }
        const periodIds = periods.map((period) => period.id);
        const kpiValues = await this.prisma.kpiValue.findMany({
            where: {
                org_id: currentUser.org_id,
                scenario_id: null,
                period_id: { in: periodIds },
                kpi: {
                    code: kpiCode,
                    is_active: true,
                },
            },
            include: { period: true },
            orderBy: { period: { period_number: 'asc' } },
        });
        return {
            kpi_code: kpiCode,
            values: kpiValues.map((value) => ({
                period: value.period.label,
                value: value.value.toString(),
                severity: value.severity,
            })),
        };
    }
    async calculateForPeriod(orgId, periodId) {
        this.logger.log(`Calcul KPIs pour periode ${periodId} org ${orgId}`);
        if (!periodId) {
            throw new common_1.BadRequestException('period_id requis');
        }
        const period = await this.prisma.period.findFirst({
            where: { id: periodId, org_id: orgId },
        });
        if (!period) {
            throw new common_1.NotFoundException('Période introuvable');
        }
        await this.seedDefaultKpis(orgId);
        let kpiDefs = await this.prisma.kpi.findMany({
            where: { org_id: orgId, is_active: true },
        });
        this.logger.log(`${kpiDefs.length} KPIs trouves`);
        if (kpiDefs.length === 0) {
            kpiDefs = await this.prisma.kpi.findMany({
                where: { org_id: orgId, is_active: true },
            });
            this.logger.log(`Apres seed: ${kpiDefs.length} KPIs trouves`);
        }
        const [transactions, budgetLines, cfPlans] = await Promise.all([
            this.prisma.transaction.findMany({
                where: { org_id: orgId, period_id: periodId, is_validated: true },
                select: { account_code: true, amount: true },
            }),
            this.prisma.budgetLine.findMany({
                where: { org_id: orgId, period_id: periodId },
                select: { line_type: true, amount_actual: true, amount_budget: true },
            }),
            this.prisma.cashFlowPlan.findMany({
                where: { org_id: orgId, period_id: periodId },
                select: { direction: true, amount: true, inflow: true, outflow: true },
            }),
        ]);
        const zero = new client_1.Prisma.Decimal('0');
        const hundred = new client_1.Prisma.Decimal('100');
        const factorReceivables = new client_1.Prisma.Decimal('0.20');
        const factorPayables = new client_1.Prisma.Decimal('0.30');
        const days = new client_1.Prisma.Decimal('365');
        const weeksQuarter = new client_1.Prisma.Decimal('13');
        const absDecimal = (value) => (value.lt(zero) ? value.neg() : value);
        const startsWithAny = (accountCode, prefixes) => prefixes.some((prefix) => accountCode.startsWith(prefix));
        const parseDecimal = (value) => {
            if (value === undefined)
                return zero;
            try {
                return value instanceof client_1.Prisma.Decimal ? value : new client_1.Prisma.Decimal(value);
            }
            catch {
                return zero;
            }
        };
        const sumTransactions = (predicate, absolute = true) => transactions.reduce((sum, tx) => {
            if (!predicate(tx))
                return sum;
            return sum.plus(absolute ? absDecimal(tx.amount) : tx.amount);
        }, zero);
        let ca = sumTransactions((tx) => startsWithAny(tx.account_code, [...syscohada_financial_mapping_1.KPI_ACCOUNT_PREFIXES.CA]));
        let ebitda = ca.minus(sumTransactions((tx) => startsWithAny(tx.account_code, [...syscohada_financial_mapping_1.KPI_ACCOUNT_PREFIXES.CHARGES])));
        let netResult = zero;
        try {
            const fs = await this.calcEngineClient.post('/reports/financial-statements', {
                transactions: transactions.map((tx) => ({
                    account_code: tx.account_code,
                    amount: tx.amount.toString(),
                })),
                cash_flow_plans: cfPlans.map((plan) => ({
                    direction: plan.direction,
                    amount: plan.amount.toString(),
                    inflow: plan.inflow.toString(),
                    outflow: plan.outflow.toString(),
                })),
            });
            const lines = fs.is_data?.lines;
            if (lines) {
                ca = parseDecimal(lines.XB);
                ebitda = parseDecimal(lines.XD);
                netResult = parseDecimal(lines.XI);
            }
        }
        catch (error) {
            this.logger.warn(`Fallback calcul local KPIs (CalcEngine indisponible) - org: ${orgId}, period: ${periodId}, reason: ${error.message}`);
        }
        const charges = ca.minus(ebitda);
        const purchases = sumTransactions((tx) => startsWithAny(tx.account_code, [...syscohada_financial_mapping_1.KPI_ACCOUNT_PREFIXES.ACHATS]));
        const payroll = sumTransactions((tx) => startsWithAny(tx.account_code, [...syscohada_financial_mapping_1.KPI_ACCOUNT_PREFIXES.MASSE_SALARIALE]));
        const opex = sumTransactions((tx) => startsWithAny(tx.account_code, [...syscohada_financial_mapping_1.KPI_ACCOUNT_PREFIXES.OPEX]));
        const totalBudget = budgetLines.reduce((sum, line) => sum.plus(absDecimal(line.amount_budget)), zero);
        const marge = ca.gt(zero) ? ebitda.div(ca).mul(hundred) : zero;
        const grossMargin = ca.gt(zero) ? ca.minus(purchases).div(ca).mul(hundred) : zero;
        const roe = totalBudget.gt(zero) ? netResult.div(totalBudget).mul(hundred) : zero;
        const receivables = ca.mul(factorReceivables);
        const payables = purchases.mul(factorPayables);
        const dailyRevenue = ca.gt(zero) ? ca.div(days) : zero;
        const dailyPurchases = purchases.gt(zero) ? purchases.div(days) : zero;
        const dso = dailyRevenue.gt(zero) ? receivables.div(dailyRevenue) : zero;
        const dpo = dailyPurchases.gt(zero) ? payables.div(dailyPurchases) : zero;
        const assetTurnover = totalBudget.gt(zero) ? ca.div(totalBudget) : zero;
        const costPerRevenue = ca.gt(zero) ? charges.div(ca).mul(hundred) : zero;
        const opexRatio = ca.gt(zero) ? opex.div(ca).mul(hundred) : zero;
        const payrollRatio = ca.gt(zero) ? payroll.div(ca).mul(hundred) : zero;
        const operatingMargin = ca.gt(zero) ? ca.minus(charges).div(ca).mul(hundred) : zero;
        const netMargin = ca.gt(zero) ? netResult.div(ca).mul(hundred) : zero;
        const roa = totalBudget.gt(zero) ? netResult.div(totalBudget).mul(hundred) : zero;
        const roce = totalBudget.gt(zero) ? ebitda.div(totalBudget).mul(hundred) : zero;
        const sumFlowByDirection = (direction) => cfPlans.reduce((sum, plan) => {
            if (plan.direction !== direction)
                return sum;
            const explicit = absDecimal(plan.amount);
            if (explicit.gt(zero))
                return sum.plus(explicit);
            const fallback = direction === 'OUT' ? plan.outflow : plan.inflow;
            return sum.plus(absDecimal(fallback));
        }, zero);
        const inflows = sumFlowByDirection('IN');
        const outflows = sumFlowByDirection('OUT');
        const netCash = inflows.minus(outflows);
        const quickAssets = inflows.mul(new client_1.Prisma.Decimal('0.70'));
        const currentRatio = outflows.gt(zero) ? inflows.div(outflows) : zero;
        const quickRatio = outflows.gt(zero) ? quickAssets.div(outflows) : zero;
        const cashRatio = outflows.gt(zero) ? netCash.div(outflows) : zero;
        const bfr = receivables.minus(payables);
        const weeklyBurn = outflows.gt(zero) ? outflows.div(weeksQuarter) : zero;
        const runway = weeklyBurn.gt(zero) ? netCash.div(weeklyBurn) : zero;
        const computed = {
            CA: ca,
            EBITDA: ebitda,
            MARGE: marge,
            MARGE_EBITDA: marge,
            CHARGES: charges,
            RUNWAY: runway,
            DSO: dso,
            GROSS_MARGIN: grossMargin,
            EBITDA_MARGIN: marge,
            OPERATING_MARGIN: operatingMargin,
            NET_MARGIN: netMargin,
            ROE: roe,
            ROA: roa,
            DPO: dpo,
            ASSET_TURNOVER: assetTurnover,
            COST_PER_REVENUE: costPerRevenue,
            OPEX_RATIO: opexRatio,
            PAYROLL_RATIO: payrollRatio,
            ROCE: roce,
            QUICK_RATIO: quickRatio,
            CURRENT_RATIO: currentRatio,
            CASH_RATIO: cashRatio,
            BFR: bfr,
        };
        const calculatedCodes = [];
        for (const kpiDef of kpiDefs) {
            const rawValue = computed[kpiDef.code];
            if (rawValue === undefined)
                continue;
            const decimalValue = rawValue.toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP);
            const severity = this.computeKpiSeverity(kpiDef, rawValue);
            await this.prisma.kpiValue.deleteMany({
                where: { org_id: orgId, kpi_id: kpiDef.id, period_id: periodId, scenario_id: null },
            });
            await this.prisma.kpiValue.create({
                data: {
                    org_id: orgId,
                    kpi_id: kpiDef.id,
                    period_id: periodId,
                    scenario_id: null,
                    value: decimalValue,
                    severity,
                    calculated_at: new Date(),
                },
            });
            await this.prisma.alert.deleteMany({
                where: { org_id: orgId, kpi_id: kpiDef.id, period_id: periodId },
            });
            if (severity !== client_1.AlertSeverity.INFO) {
                const threshold = severity === client_1.AlertSeverity.CRITICAL ? kpiDef.threshold_critical : kpiDef.threshold_warn;
                const seuilLabel = severity === client_1.AlertSeverity.CRITICAL ? 'seuil critique' : "seuil d'alerte";
                await this.prisma.alert.create({
                    data: {
                        org_id: orgId,
                        kpi_id: kpiDef.id,
                        period_id: periodId,
                        severity,
                        message: `${kpiDef.label} : valeur calculée = ${decimalValue} ${kpiDef.unit}${threshold !== null ? ` (${seuilLabel} : ${threshold})` : ''}`,
                        is_read: false,
                    },
                });
            }
            calculatedCodes.push(kpiDef.code);
        }
        await this.invalidateCacheForPeriod(orgId, periodId);
        this.logger.log(`KPIs calculés - org: ${orgId}, period: ${periodId}, codes: [${calculatedCodes.join(', ')}]`);
        return { calculated: calculatedCodes.length, kpis: calculatedCodes };
    }
    async getValuesAggregated(currentUser, periodIds, virtualPeriodId) {
        if (periodIds.length === 0)
            return [];
        const additive = new Set(['CA', 'EBITDA', 'CHARGES', 'OPEX']);
        const values = await this.prisma.kpiValue.findMany({
            where: {
                org_id: currentUser.org_id,
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
            const severity = this.computeKpiSeverity(latest.kpi, aggregatedValue);
            result.push({
                kpi_id: latest.kpi_id,
                kpi_code: code,
                kpi_label: latest.kpi.label,
                category: latest.kpi.category,
                description: latest.kpi.description,
                unit: latest.kpi.unit,
                period_id: virtualPeriodId,
                scenario_id: null,
                value: aggregatedValue.toDecimalPlaces(2).toString(),
                threshold_warn: latest.kpi.threshold_warn?.toString() ?? null,
                threshold_critical: latest.kpi.threshold_critical?.toString() ?? null,
                severity,
                calculated_at: latest.calculated_at,
            });
        }
        const caEntry = result.find((r) => r.kpi_code === 'CA');
        const ebitdaEntry = result.find((r) => r.kpi_code === 'EBITDA');
        const margeEntry = result.find((r) => r.kpi_code === 'MARGE_EBITDA' || r.kpi_code === 'MARGE');
        if (caEntry && ebitdaEntry && margeEntry) {
            const caDecimal = new client_1.Prisma.Decimal(caEntry.value);
            if (!caDecimal.eq(0)) {
                const newMarge = new client_1.Prisma.Decimal(ebitdaEntry.value)
                    .div(caDecimal)
                    .mul(100)
                    .toDecimalPlaces(2)
                    .toString();
                margeEntry.value = newMarge;
                const margeKpiVals = byCode.get(margeEntry.kpi_code);
                if (margeKpiVals?.length) {
                    margeEntry.severity = this.computeKpiSeverity(margeKpiVals[0].kpi, new client_1.Prisma.Decimal(newMarge));
                }
            }
        }
        try {
            const calcLines = await this.getCalcIncomeStatementLinesForPeriods(currentUser.org_id, periodIds);
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
                const ca = toDecimal(calcLines.XB);
                const ebitda = toDecimal(calcLines.XD);
                const operating = toDecimal(calcLines.XE);
                const net = toDecimal(calcLines.XI);
                const achats = toDecimal(calcLines.RA);
                const charges = ca.minus(ebitda);
                const ebitdaMargin = ca.gt(zero) ? ebitda.div(ca).mul(hundred) : zero;
                const netMargin = ca.gt(zero) ? net.div(ca).mul(hundred) : zero;
                const operatingMargin = ca.gt(zero) ? operating.div(ca).mul(hundred) : zero;
                const grossMargin = ca.gt(zero) ? ca.minus(achats).div(ca).mul(hundred) : zero;
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
                applyOverride('CA', ca);
                applyOverride('EBITDA', ebitda);
                applyOverride('CHARGES', charges);
                applyOverride('MARGE', ebitdaMargin);
                applyOverride('MARGE_EBITDA', ebitdaMargin);
                applyOverride('EBITDA_MARGIN', ebitdaMargin);
                applyOverride('NET_MARGIN', netMargin);
                applyOverride('OPERATING_MARGIN', operatingMargin);
                applyOverride('GROSS_MARGIN', grossMargin);
            }
        }
        catch (error) {
            this.logger.warn(`Fallback aggregation KPIs locale (CalcEngine indisponible) - org: ${currentUser.org_id}, periods: [${periodIds.join(',')}], reason: ${error.message}`);
        }
        return result.sort((a, b) => {
            const rank = { CRITICAL: 3, WARN: 2, INFO: 1 };
            return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
        });
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
        const fs = await this.calcEngineClient.post('/reports/financial-statements', {
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
        });
        return fs.is_data?.lines ?? null;
    }
    async resolvePeriodIds(orgId, params) {
        if (params.periodId) {
            return { periodIds: [params.periodId], mode: 'single', virtualPeriodId: params.periodId };
        }
        const activePeriod = await this.prisma.period.findFirst({
            where: { org_id: orgId, status: client_1.PeriodStatus.OPEN },
            select: { fiscal_year_id: true },
            orderBy: { period_number: 'desc' },
        });
        const fiscalYearId = activePeriod?.fiscal_year_id;
        if (!fiscalYearId) {
            return { periodIds: [], mode: 'aggregate', virtualPeriodId: 'AGG' };
        }
        if (params.ytd) {
            const currentMonth = new Date().getMonth() + 1;
            const periods = await this.prisma.period.findMany({
                where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { lte: currentMonth } },
                select: { id: true },
                orderBy: { period_number: 'asc' },
            });
            return { periodIds: periods.map((p) => p.id), mode: 'aggregate', virtualPeriodId: 'YTD' };
        }
        if (params.quarter && params.quarter >= 1 && params.quarter <= 4) {
            const start = (params.quarter - 1) * 3 + 1;
            const end = start + 2;
            const periods = await this.prisma.period.findMany({
                where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { gte: start, lte: end } },
                select: { id: true },
                orderBy: { period_number: 'asc' },
            });
            return { periodIds: periods.map((p) => p.id), mode: 'aggregate', virtualPeriodId: `Q${params.quarter}` };
        }
        if (params.fromPeriod && params.toPeriod) {
            const bounds = await this.prisma.period.findMany({
                where: {
                    org_id: orgId,
                    id: { in: [params.fromPeriod, params.toPeriod] },
                    fiscal_year_id: fiscalYearId,
                },
                select: { id: true, period_number: true },
            });
            if (bounds.length < 2) {
                return { periodIds: [], mode: 'aggregate', virtualPeriodId: 'CUSTOM' };
            }
            const from = bounds.find((b) => b.id === params.fromPeriod);
            const to = bounds.find((b) => b.id === params.toPeriod);
            if (!from || !to) {
                return { periodIds: [], mode: 'aggregate', virtualPeriodId: 'CUSTOM' };
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
                mode: 'aggregate',
                virtualPeriodId: `CUSTOM:${params.fromPeriod}:${params.toPeriod}`,
            };
        }
        return { periodIds: [], mode: 'aggregate', virtualPeriodId: 'AGG' };
    }
    async seedDefaultKpis(orgId) {
        const defaults = [
            {
                code: 'GROSS_MARGIN',
                label: 'Marge Brute',
                unit: '%',
                formula: '((CA - ACHATS) / CA) * 100',
                category: 'PROFITABILITY',
                description: '(CA - Achats) / CA × 100',
                threshold_warn: new client_1.Prisma.Decimal('30'),
                threshold_critical: new client_1.Prisma.Decimal('15'),
            },
            {
                code: 'EBITDA_MARGIN',
                label: 'Marge EBITDA',
                unit: '%',
                formula: '(EBITDA / CA) * 100',
                category: 'PROFITABILITY',
                description: 'EBITDA / CA x 100',
                threshold_warn: new client_1.Prisma.Decimal('10'),
                threshold_critical: new client_1.Prisma.Decimal('5'),
            },
            {
                code: 'OPERATING_MARGIN',
                label: 'Marge Operationnelle',
                unit: '%',
                formula: '((CA - CHARGES) / CA) * 100',
                category: 'PROFITABILITY',
                description: "Resultat d'exploitation / CA × 100",
                threshold_warn: new client_1.Prisma.Decimal('10'),
                threshold_critical: new client_1.Prisma.Decimal('5'),
            },
            {
                code: 'NET_MARGIN',
                label: 'Marge Nette',
                unit: '%',
                formula: '(RESULTAT_NET / CA) * 100',
                category: 'PROFITABILITY',
                description: 'Resultat net / CA x 100',
                threshold_warn: new client_1.Prisma.Decimal('5'),
                threshold_critical: new client_1.Prisma.Decimal('0'),
            },
            {
                code: 'ROA',
                label: 'Rentabilite des Actifs (ROA)',
                unit: '%',
                formula: '(RESULTAT_NET / TOTAL_ACTIF) * 100',
                category: 'PROFITABILITY',
                description: 'Resultat net / Total actif × 100',
                threshold_warn: new client_1.Prisma.Decimal('5'),
                threshold_critical: new client_1.Prisma.Decimal('2'),
            },
            {
                code: 'ROE',
                label: 'ROE',
                unit: '%',
                formula: '(RESULTAT_NET / CAPITAUX_PROPRES) * 100',
                category: 'PROFITABILITY',
                description: 'Resultat net / Capitaux propres',
                threshold_warn: new client_1.Prisma.Decimal('10'),
                threshold_critical: new client_1.Prisma.Decimal('5'),
            },
            {
                code: 'DSO',
                label: 'Delai Encaissement Clients',
                unit: 'jours',
                formula: 'CREANCES_CLIENTS / (CA / 365)',
                category: 'ACTIVITY',
                description: 'Delai moyen de paiement des clients',
                threshold_warn: new client_1.Prisma.Decimal('60'),
                threshold_critical: new client_1.Prisma.Decimal('90'),
            },
            {
                code: 'DPO',
                label: 'Delai Paiement Fournisseurs',
                unit: 'jours',
                formula: 'DETTES_FOURNISSEURS / (ACHATS / 365)',
                category: 'ACTIVITY',
                description: 'Delai moyen de paiement fournisseurs',
                threshold_warn: null,
                threshold_critical: null,
            },
            {
                code: 'ASSET_TURNOVER',
                label: 'Rotation Actif',
                unit: 'x',
                formula: 'CA / TOTAL_ACTIF',
                category: 'ACTIVITY',
                description: 'CA / Total actif',
                threshold_warn: new client_1.Prisma.Decimal('0.5'),
                threshold_critical: new client_1.Prisma.Decimal('0.3'),
            },
            {
                code: 'COST_PER_REVENUE',
                label: 'Charges / CA',
                unit: '%',
                formula: '(CHARGES / CA) * 100',
                category: 'EFFICIENCY',
                description: 'Charges totales / CA x 100',
                threshold_warn: new client_1.Prisma.Decimal('80'),
                threshold_critical: new client_1.Prisma.Decimal('90'),
            },
            {
                code: 'OPEX_RATIO',
                label: 'Ratio OPEX',
                unit: '%',
                formula: '(OPEX / CA) * 100',
                category: 'EFFICIENCY',
                description: 'Charges operationnelles / CA',
                threshold_warn: new client_1.Prisma.Decimal('40'),
                threshold_critical: new client_1.Prisma.Decimal('55'),
            },
            {
                code: 'PAYROLL_RATIO',
                label: 'Masse Salariale / CA',
                unit: '%',
                formula: '(SALAIRES / CA) * 100',
                category: 'EFFICIENCY',
                description: 'Salaires / CA x 100',
                threshold_warn: new client_1.Prisma.Decimal('35'),
                threshold_critical: new client_1.Prisma.Decimal('45'),
            },
            {
                code: 'ROCE',
                label: 'Return on Capital Employed',
                unit: '%',
                formula: '(EBIT / CAPITAL_EMPLOYE) * 100',
                category: 'EFFICIENCY',
                description: 'Rendement du capital investi',
                threshold_warn: new client_1.Prisma.Decimal('10'),
                threshold_critical: new client_1.Prisma.Decimal('5'),
            },
            {
                code: 'CURRENT_RATIO',
                label: 'Current Ratio',
                unit: 'x',
                formula: 'ACTIF_CT / PASSIF_CT',
                category: 'LIQUIDITY',
                description: 'Capacite a honorer les dettes CT',
                threshold_warn: new client_1.Prisma.Decimal('1.5'),
                threshold_critical: new client_1.Prisma.Decimal('1.0'),
            },
            {
                code: 'QUICK_RATIO',
                label: 'Quick Ratio',
                unit: 'x',
                formula: '((ACTIF_CT - STOCKS) / PASSIF_CT)',
                category: 'LIQUIDITY',
                description: 'Liquidite immediate sans les stocks',
                threshold_warn: new client_1.Prisma.Decimal('1.0'),
                threshold_critical: new client_1.Prisma.Decimal('0.5'),
            },
            {
                code: 'CASH_RATIO',
                label: 'Cash Ratio',
                unit: 'x',
                formula: 'TRESORERIE / DETTES_CT',
                category: 'LIQUIDITY',
                description: 'Tresorerie / Dettes CT',
                threshold_warn: new client_1.Prisma.Decimal('0.5'),
                threshold_critical: new client_1.Prisma.Decimal('0.2'),
            },
            {
                code: 'BFR',
                label: 'Besoin en Fonds de Roulement',
                unit: 'FCFA',
                formula: 'CREANCES + STOCKS - DETTES_FOURNISSEURS',
                category: 'LIQUIDITY',
                description: 'Creances + Stocks - Dettes fournisseurs',
                threshold_warn: null,
                threshold_critical: null,
            },
            {
                code: 'CA',
                label: "Chiffre d'Affaires Total",
                unit: 'FCFA',
                formula: 'SUM(REVENUE)',
                category: 'PROFITABILITY',
                description: 'Revenus totaux de la periode',
                threshold_warn: null,
                threshold_critical: null,
            },
            {
                code: 'EBITDA',
                label: 'EBITDA',
                unit: 'FCFA',
                formula: 'CA - OPEX',
                category: 'PROFITABILITY',
                description: 'Resultat operationnel avant amortissements',
                threshold_warn: null,
                threshold_critical: null,
            },
            {
                code: 'MARGE_EBITDA',
                label: 'Marge EBITDA',
                unit: '%',
                formula: '((CA - OPEX) / CA) * 100',
                category: 'PROFITABILITY',
                description: 'EBITDA / CA x 100',
                threshold_warn: new client_1.Prisma.Decimal('10'),
                threshold_critical: new client_1.Prisma.Decimal('5'),
            },
            {
                code: 'CHARGES',
                label: 'Charges totales',
                unit: 'FCFA',
                formula: 'SUM(EXPENSE)',
                category: 'EFFICIENCY',
                description: 'Somme des charges periodiques',
                threshold_warn: null,
                threshold_critical: null,
            },
            {
                code: 'RUNWAY',
                label: 'Runway Tresorerie',
                unit: 'semaines',
                formula: 'Cash / BurnRate',
                category: 'LIQUIDITY',
                description: 'Semaines de tresorerie restantes',
                threshold_warn: new client_1.Prisma.Decimal('8'),
                threshold_critical: new client_1.Prisma.Decimal('4'),
            },
        ];
        for (const kpi of defaults) {
            await this.prisma.kpi.upsert({
                where: {
                    org_id_code: {
                        org_id: orgId,
                        code: kpi.code,
                    },
                },
                update: {
                    label: kpi.label,
                    formula: kpi.formula,
                    unit: kpi.unit,
                    category: kpi.category,
                    description: kpi.description,
                    threshold_warn: kpi.threshold_warn,
                    threshold_critical: kpi.threshold_critical,
                },
                create: {
                    org_id: orgId,
                    code: kpi.code,
                    label: kpi.label,
                    formula: kpi.formula,
                    unit: kpi.unit,
                    category: kpi.category,
                    description: kpi.description,
                    threshold_warn: kpi.threshold_warn,
                    threshold_critical: kpi.threshold_critical,
                    is_active: true,
                },
            });
        }
    }
    computeKpiSeverity(kpiDef, value) {
        const lowerIsBetter = ['DSO', 'DPO', 'COST_PER_REVENUE', 'OPEX_RATIO', 'PAYROLL_RATIO'].includes(kpiDef.code);
        if (kpiDef.threshold_critical !== null) {
            if (lowerIsBetter ? value.gt(kpiDef.threshold_critical) : value.lt(kpiDef.threshold_critical)) {
                return client_1.AlertSeverity.CRITICAL;
            }
        }
        if (kpiDef.threshold_warn !== null) {
            if (lowerIsBetter ? value.gt(kpiDef.threshold_warn) : value.lt(kpiDef.threshold_warn)) {
                return client_1.AlertSeverity.WARN;
            }
        }
        return client_1.AlertSeverity.INFO;
    }
    async invalidateCacheForPeriod(orgId, periodId) {
        const key = this.buildCacheKey(orgId, periodId);
        await this.redisService.del(key);
        this.logger.log(`KPI cache invalidated - org: ${orgId}, period: ${periodId}`);
    }
    buildCacheKey(orgId, periodId, scenarioId) {
        if (!scenarioId) {
            return `kpis:${orgId}:${periodId}`;
        }
        return `kpis:${orgId}:${periodId}:scenario:${scenarioId}`;
    }
    toValueResponse(value) {
        return {
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
        };
    }
};
exports.KpisService = KpisService;
exports.KpisService = KpisService = KpisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        calc_engine_client_1.CalcEngineClient])
], KpisService);
//# sourceMappingURL=kpis.service.js.map