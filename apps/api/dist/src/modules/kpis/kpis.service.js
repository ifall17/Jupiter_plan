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