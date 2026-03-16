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
const prisma_service_1 = require("../../prisma/prisma.service");
const redis_service_1 = require("../../redis/redis.service");
let KpisService = KpisService_1 = class KpisService {
    constructor(prisma, redisService) {
        this.prisma = prisma;
        this.redisService = redisService;
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
            threshold_warn: kpi.threshold_warn?.toString() ?? null,
            threshold_critical: kpi.threshold_critical?.toString() ?? null,
            is_active: kpi.is_active,
        }));
    }
    async getValues(currentUser, periodId, scenarioId) {
        const cacheKey = this.buildCacheKey(currentUser.org_id, periodId, scenarioId);
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
        const values = await this.prisma.kpiValue.findMany({
            where: {
                org_id: currentUser.org_id,
                period_id: periodId,
                ...(scenarioId ? { scenario_id: scenarioId } : { scenario_id: null }),
                kpi: { is_active: true },
            },
            include: {
                kpi: true,
            },
            orderBy: [{ severity: 'desc' }, { calculated_at: 'desc' }],
        });
        const response = values.map((value) => this.toValueResponse(value));
        await this.redisService.set(cacheKey, JSON.stringify(response), 'EX', business_constants_1.CACHE_TTL_KPI);
        return response;
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
        let kpiDefs = await this.prisma.kpi.findMany({
            where: { org_id: orgId, is_active: true },
        });
        this.logger.log(`${kpiDefs.length} KPIs trouves`);
        if (kpiDefs.length === 0) {
            await this.seedDefaultKpis(orgId);
            kpiDefs = await this.prisma.kpi.findMany({
                where: { org_id: orgId, is_active: true },
            });
            this.logger.log(`Apres seed: ${kpiDefs.length} KPIs trouves`);
        }
        const budgetLines = await this.prisma.budgetLine.findMany({
            where: { org_id: orgId, period_id: periodId },
            select: { line_type: true, amount_actual: true },
        });
        const sumByType = (type) => budgetLines
            .filter((l) => l.line_type === type)
            .reduce((s, l) => s + Number(l.amount_actual), 0);
        const ca = sumByType(client_1.LineType.REVENUE);
        const opex = sumByType(client_1.LineType.EXPENSE);
        const ebitda = ca - opex;
        const marge = ca > 0 ? ((ca - opex) / ca) * 100 : 0;
        const cashAgg = await this.prisma.bankAccount.aggregate({
            where: { org_id: orgId, is_active: true },
            _sum: { balance: true },
        });
        const cash = Number(cashAgg._sum.balance ?? 0);
        const cfPlans = await this.prisma.cashFlowPlan.findMany({
            where: { org_id: orgId, period_id: periodId },
            select: { outflow: true, amount: true, direction: true },
        });
        const totalBurn = cfPlans.reduce((s, p) => {
            const strict = Number(p.amount);
            return s + (strict > 0 && p.direction === 'OUT' ? strict : Number(p.outflow));
        }, 0);
        const avgWeeklyBurn = cfPlans.length > 0 ? totalBurn / cfPlans.length : opex / 4;
        const runway = avgWeeklyBurn > 0 ? cash / avgWeeklyBurn : 0;
        const dso = ca > 0 ? (opex / ca) * 30 : 0;
        const computed = {
            CA: ca,
            EBITDA: ebitda,
            MARGE: marge,
            MARGE_EBITDA: marge,
            CHARGES: opex,
            RUNWAY: runway,
            DSO: dso,
        };
        const calculatedCodes = [];
        for (const kpiDef of kpiDefs) {
            const rawValue = computed[kpiDef.code];
            if (rawValue === undefined)
                continue;
            const decimalValue = new client_1.Prisma.Decimal(rawValue.toFixed(2));
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
            calculatedCodes.push(kpiDef.code);
        }
        await this.invalidateCacheForPeriod(orgId, periodId);
        this.logger.log(`KPIs calculés - org: ${orgId}, period: ${periodId}, codes: [${calculatedCodes.join(', ')}]`);
        return { calculated: calculatedCodes.length, kpis: calculatedCodes };
    }
    async seedDefaultKpis(orgId) {
        const defaults = [
            {
                code: 'CA',
                label: "Chiffre d'Affaires",
                unit: 'FCFA',
                formula: 'SUM(REVENUE)',
                threshold_warn: null,
                threshold_critical: null,
            },
            {
                code: 'EBITDA',
                label: 'EBITDA',
                unit: 'FCFA',
                formula: 'CA - OPEX',
                threshold_warn: null,
                threshold_critical: null,
            },
            {
                code: 'MARGE_EBITDA',
                label: 'Marge EBITDA',
                unit: '%',
                formula: '((CA - OPEX) / CA) * 100',
                threshold_warn: new client_1.Prisma.Decimal('10'),
                threshold_critical: new client_1.Prisma.Decimal('5'),
            },
            {
                code: 'CHARGES',
                label: 'Charges totales',
                unit: 'FCFA',
                formula: 'SUM(EXPENSE)',
                threshold_warn: null,
                threshold_critical: null,
            },
            {
                code: 'RUNWAY',
                label: 'Runway Tresorerie',
                unit: 'semaines',
                formula: 'Cash / BurnRate',
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
                update: {},
                create: {
                    org_id: orgId,
                    code: kpi.code,
                    label: kpi.label,
                    formula: kpi.formula,
                    unit: kpi.unit,
                    threshold_warn: kpi.threshold_warn,
                    threshold_critical: kpi.threshold_critical,
                    is_active: true,
                },
            });
        }
    }
    computeKpiSeverity(kpiDef, value) {
        const lowerIsBetter = kpiDef.code === 'DSO';
        if (kpiDef.threshold_critical !== null) {
            const crit = Number(kpiDef.threshold_critical);
            if (lowerIsBetter ? value > crit : value < crit)
                return client_1.AlertSeverity.CRITICAL;
        }
        if (kpiDef.threshold_warn !== null) {
            const warn = Number(kpiDef.threshold_warn);
            if (lowerIsBetter ? value > warn : value < warn)
                return client_1.AlertSeverity.WARN;
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
            unit: value.kpi.unit,
            period_id: value.period_id,
            scenario_id: value.scenario_id,
            value: value.value.toString(),
            severity: value.severity,
            calculated_at: value.calculated_at,
        };
    }
};
exports.KpisService = KpisService;
exports.KpisService = KpisService = KpisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], KpisService);
//# sourceMappingURL=kpis.service.js.map