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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const rxjs_1 = require("rxjs");
const syscohada_mapping_service_1 = require("../../common/services/syscohada-mapping.service");
const prisma_service_1 = require("../../prisma/prisma.service");
let ReportsService = class ReportsService {
    constructor(prisma, httpService, config, syscohadaMappingService) {
        this.prisma = prisma;
        this.httpService = httpService;
        this.config = config;
        this.syscohadaMappingService = syscohadaMappingService;
    }
    async generate(dto, orgId) {
        const data = await this.getReportData(dto, orgId);
        const calcUrl = this.config.get('CALC_ENGINE_URL') ?? this.config.get('calcEngine.url');
        if (!calcUrl) {
            throw new common_1.InternalServerErrorException('CALC_ENGINE_URL is not configured');
        }
        let response;
        try {
            response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${calcUrl}/reports/generate`, {
                report_type: dto.report_type,
                format: dto.format,
                org_name: data.orgName,
                snapshot: data.snapshot,
                transactions: data.transactions,
                cash_flow_plans: data.cashFlowPlans,
                kpis: data.kpis,
                period_label: data.periodLabel,
            }, {
                responseType: 'arraybuffer',
                timeout: 30000,
            }));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown CalcEngine error';
            throw new common_1.InternalServerErrorException(`CalcEngine delegation failed: ${message}`);
        }
        const date = new Date().toISOString().slice(0, 10);
        const ext = dto.format === 'pdf' ? 'pdf' : 'xlsx';
        const name = {
            pl: 'Compte_de_resultat',
            balance_sheet: 'Bilan',
            cash_flow: 'Flux_de_Tresorerie',
            budget_variance: 'Budget_vs_Reel',
            transactions: 'Journal_Transactions',
            kpis: 'KPIs',
        }[dto.report_type] ?? dto.report_type;
        return {
            buffer: Buffer.from(response.data),
            filename: `${name}_${date}.${ext}`,
            contentType: dto.format === 'pdf'
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
    }
    async getPeriodIds(orgId, params) {
        if (params.period_id) {
            return [params.period_id];
        }
        const activePeriod = await this.prisma.period.findFirst({
            where: { org_id: orgId, status: client_1.PeriodStatus.OPEN },
            select: { fiscal_year_id: true },
            orderBy: { period_number: 'desc' },
        });
        const fiscalYearId = activePeriod?.fiscal_year_id;
        if (!fiscalYearId)
            return [];
        if (params.ytd) {
            const currentMonth = new Date().getMonth() + 1;
            const periods = await this.prisma.period.findMany({
                where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { lte: currentMonth } },
                select: { id: true },
                orderBy: { period_number: 'asc' },
            });
            return periods.map((p) => p.id);
        }
        if (params.quarter && params.quarter >= 1 && params.quarter <= 4) {
            const start = (params.quarter - 1) * 3 + 1;
            const end = start + 2;
            const periods = await this.prisma.period.findMany({
                where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { gte: start, lte: end } },
                select: { id: true },
                orderBy: { period_number: 'asc' },
            });
            return periods.map((p) => p.id);
        }
        if (params.from_period && params.to_period) {
            const bounds = await this.prisma.period.findMany({
                where: {
                    org_id: orgId,
                    id: { in: [params.from_period, params.to_period] },
                    fiscal_year_id: fiscalYearId,
                },
                select: { id: true, period_number: true },
            });
            if (bounds.length < 2)
                return [];
            const from = bounds.find((b) => b.id === params.from_period);
            const to = bounds.find((b) => b.id === params.to_period);
            if (!from || !to)
                return [];
            const min = Math.min(from.period_number, to.period_number);
            const max = Math.max(from.period_number, to.period_number);
            const periods = await this.prisma.period.findMany({
                where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { gte: min, lte: max } },
                select: { id: true },
                orderBy: { period_number: 'asc' },
            });
            return periods.map((p) => p.id);
        }
        return [];
    }
    async getReportData(dto, orgId) {
        const periodIds = await this.getPeriodIds(orgId, dto);
        const [org, transactions, cashFlowPlans, kpiValues] = await Promise.all([
            this.prisma.organization.findFirst({
                where: { id: orgId },
                select: { name: true },
            }),
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
            this.prisma.kpiValue.findMany({
                where: {
                    org_id: orgId,
                    period_id: { in: periodIds },
                    scenario_id: null,
                },
                include: { kpi: true },
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
        let periodLabel = 'Periode selectionnee';
        if (dto.period_id) {
            const period = await this.prisma.period.findUnique({ where: { id: dto.period_id }, select: { label: true } });
            periodLabel = period?.label ?? periodLabel;
        }
        else if (dto.ytd) {
            const month = new Date().toLocaleDateString('fr-FR', { month: 'long' });
            periodLabel = `YTD Janvier -> ${month}`;
        }
        else if (dto.quarter) {
            periodLabel = `T${dto.quarter} 2026`;
        }
        else if (dto.from_period && dto.to_period) {
            const bounds = await this.prisma.period.findMany({
                where: { id: { in: [dto.from_period, dto.to_period] }, org_id: orgId },
                select: { id: true, label: true },
            });
            const from = bounds.find((b) => b.id === dto.from_period);
            const to = bounds.find((b) => b.id === dto.to_period);
            if (from && to) {
                periodLabel = `Plage ${from.label} -> ${to.label}`;
            }
        }
        const resolvedLineTypes = await this.syscohadaMappingService.resolveReportLineTypes(orgId, transactions.map((t) => ({ accountCode: t.account_code, amount: t.amount.toString() })));
        return {
            orgName: org?.name ?? 'Organisation',
            periodLabel,
            snapshot: {
                is_revenue: latestSnapshot?.is_revenue.toString() ?? '0',
                is_expenses: latestSnapshot?.is_expenses.toString() ?? '0',
                is_net: latestSnapshot?.is_net.toString() ?? '0',
                bs_assets: latestSnapshot?.bs_assets.toString() ?? '0',
                bs_liabilities: latestSnapshot?.bs_liabilities.toString() ?? '0',
                bs_equity: latestSnapshot?.bs_equity.toString() ?? '0',
            },
            transactions: transactions.map((t, index) => ({
                account_code: t.account_code,
                account_label: t.account_label,
                department: t.department,
                line_type: resolvedLineTypes[index],
                amount: t.amount.toString(),
                transaction_date: (t.period?.start_date ?? new Date()).toISOString(),
                is_validated: t.is_validated,
                label: t.account_label,
            })),
            cashFlowPlans: cashFlowPlans.map((p) => ({
                direction: p.direction,
                amount: p.amount.toString(),
                flow_type: p.flow_type,
                label: p.label,
                planned_date: (p.planned_date ?? new Date()).toISOString(),
            })),
            kpis: kpiValues.map((k) => ({
                label: k.kpi.label,
                value: k.value.toString(),
                unit: k.kpi.unit,
                status: k.severity,
                threshold_warn: k.kpi.threshold_warn?.toString() ?? null,
                threshold_critical: k.kpi.threshold_critical?.toString() ?? null,
            })),
        };
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        axios_1.HttpService,
        config_1.ConfigService,
        syscohada_mapping_service_1.SyscohadaMappingService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map