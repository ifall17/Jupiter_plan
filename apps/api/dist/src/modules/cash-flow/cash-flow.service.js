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
exports.CashFlowService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const cash_flow_repository_1 = require("./cash-flow.repository");
let CashFlowService = class CashFlowService {
    constructor(cashFlowRepository) {
        this.cashFlowRepository = cashFlowRepository;
    }
    async getRollingPlan(params) {
        const periodIds = await this.resolvePeriodIds(params.org_id, {
            period_id: params.period_id,
            ytd: params.ytd,
            quarter: params.quarter,
            from_period: params.from_period,
            to_period: params.to_period,
        });
        const plans = await this.cashFlowRepository.findRollingPlans({
            org_id: params.org_id,
            period_ids: periodIds.length > 0 ? periodIds : undefined,
        });
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const weekly = Array.from({ length: 13 }, (_, i) => ({
            week: i + 1,
            inflows: '0',
            outflows: '0',
        }));
        plans.forEach((plan) => {
            const weekIndex = (() => {
                if (plan.planned_date) {
                    const planned = new Date(plan.planned_date);
                    planned.setHours(0, 0, 0, 0);
                    const diffWeeks = Math.floor((planned.getTime() - now.getTime()) / weekMs);
                    if (diffWeeks < 0 || diffWeeks > 12) {
                        return -1;
                    }
                    return diffWeeks;
                }
                const fallback = plan.week_number - 1;
                if (fallback < 0 || fallback > 12) {
                    return -1;
                }
                return fallback;
            })();
            if (weekIndex < 0 || weekIndex > 12) {
                return;
            }
            const strictAmount = Number.parseFloat(plan.amount.toString());
            const strictInflows = plan.direction === client_1.CashFlowDirection.IN ? strictAmount : 0;
            const strictOutflows = plan.direction === client_1.CashFlowDirection.OUT ? strictAmount : 0;
            const legacyInflows = Number.parseFloat(plan.inflow.toString());
            const legacyOutflows = Number.parseFloat(plan.outflow.toString());
            const normalizedInflows = strictAmount > 0 ? strictInflows : legacyInflows;
            const normalizedOutflows = strictAmount > 0 ? strictOutflows : legacyOutflows;
            const inflows = Number.parseFloat(weekly[weekIndex].inflows) + normalizedInflows;
            const outflows = Number.parseFloat(weekly[weekIndex].outflows) + normalizedOutflows;
            weekly[weekIndex].inflows = String(inflows);
            weekly[weekIndex].outflows = String(outflows);
        });
        const totalInflows = weekly.reduce((sum, item) => sum + Number.parseFloat(item.inflows), 0);
        const totalOutflows = weekly.reduce((sum, item) => sum + Number.parseFloat(item.outflows), 0);
        const runway = totalOutflows > 0
            ? Math.floor(totalInflows / (totalOutflows / 13))
            : 0;
        return {
            weekly,
            total_inflows: String(totalInflows),
            total_outflows: String(totalOutflows),
            runway_weeks: runway,
            entries_count: plans.length,
        };
    }
    async createPlannedEntry(currentUser, dto) {
        const plannedDate = new Date(dto.planned_date);
        if (Number.isNaN(plannedDate.getTime())) {
            throw new common_1.NotFoundException('Invalid planned_date');
        }
        const period = await this.cashFlowRepository.findPeriodByDate(currentUser.org_id, plannedDate);
        if (!period) {
            throw new common_1.NotFoundException('Aucune période trouvée pour cette date');
        }
        const diffMs = plannedDate.getTime() - period.start_date.getTime();
        const weekNumber = Math.min(13, Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1));
        if (dto.bank_account_id) {
            const bankAccount = await this.cashFlowRepository.findBankAccountById(currentUser.org_id, dto.bank_account_id);
            if (!bankAccount) {
                throw new common_1.BadRequestException('Compte bancaire invalide pour cette organisation');
            }
        }
        const amount = new client_1.Prisma.Decimal(dto.amount);
        const inflow = dto.direction === 'IN' ? amount : new client_1.Prisma.Decimal('0');
        const outflow = dto.direction === 'OUT' ? amount : new client_1.Prisma.Decimal('0');
        const balance = inflow.minus(outflow);
        const weeklyBurn = outflow.gt(new client_1.Prisma.Decimal('0')) ? outflow : new client_1.Prisma.Decimal('0');
        const cashBalance = await this.cashFlowRepository.totalActiveCash(currentUser.org_id);
        const runwayWeeks = this.calculateRunwayWeeks(cashBalance, weeklyBurn);
        const plan = await this.cashFlowRepository.create({
            org_id: currentUser.org_id,
            period_id: period.id,
            week_number: weekNumber,
            planned_date: plannedDate,
            flow_type: dto.flow_type,
            direction: dto.direction,
            amount,
            bank_account_id: dto.bank_account_id ?? null,
            notes: dto.notes?.trim() ?? null,
            label: dto.label.trim(),
            inflow,
            outflow,
            balance,
            runway_weeks: runwayWeeks,
        });
        return this.toResponse(plan);
    }
    async listRollingPlan(params) {
        const plans = await this.cashFlowRepository.findRollingPlans({
            org_id: params.currentUser.org_id,
            fiscal_year_id: params.fiscal_year_id,
            period_id: params.period_id,
        });
        return plans.map((plan) => this.toResponse(plan));
    }
    async listPlans(currentUser, params) {
        const periodIds = await this.resolvePeriodIds(currentUser.org_id, {
            period_id: params?.period_id,
            ytd: params?.ytd,
            quarter: params?.quarter,
            from_period: params?.from_period,
            to_period: params?.to_period,
        });
        const plans = await this.cashFlowRepository.findRollingPlans({
            org_id: currentUser.org_id,
            period_ids: periodIds.length > 0 ? periodIds : undefined,
        });
        return plans.map((plan) => this.toResponse(plan));
    }
    async deletePlan(id, orgId) {
        const plan = await this.cashFlowRepository.findByIdInOrg(id, orgId);
        if (!plan) {
            throw new common_1.NotFoundException('Flux introuvable');
        }
        await this.cashFlowRepository.deletePlan(id, orgId);
        return { success: true };
    }
    async createOrUpdatePlan(currentUser, dto) {
        const inflow = new client_1.Prisma.Decimal(dto.inflow);
        const outflow = new client_1.Prisma.Decimal(dto.outflow);
        const balance = inflow.minus(outflow);
        const cashBalance = await this.cashFlowRepository.totalActiveCash(currentUser.org_id);
        const runwayWeeks = this.calculateRunwayWeeks(cashBalance, outflow);
        const existing = await this.cashFlowRepository.findByPeriodAndWeek(currentUser.org_id, dto.period_id, dto.week_number);
        const period = await this.cashFlowRepository.findPeriodById(dto.period_id, currentUser.org_id);
        if (!period) {
            throw new common_1.NotFoundException();
        }
        const plannedDate = new Date(period.start_date.getTime() + (dto.week_number - 1) * 7 * 24 * 60 * 60 * 1000);
        const plan = existing
            ? await this.cashFlowRepository.update(existing.id, currentUser.org_id, {
                label: dto.label.trim(),
                planned_date: plannedDate,
                flow_type: client_1.CashFlowType.LEGACY,
                direction: inflow.gt(new client_1.Prisma.Decimal('0')) ? client_1.CashFlowDirection.IN : client_1.CashFlowDirection.OUT,
                amount: inflow.gt(new client_1.Prisma.Decimal('0')) ? inflow : outflow,
                notes: null,
                bank_account_id: null,
                inflow,
                outflow,
                balance,
                runway_weeks: runwayWeeks,
            })
            : await this.cashFlowRepository.create({
                org_id: currentUser.org_id,
                period_id: dto.period_id,
                week_number: dto.week_number,
                planned_date: plannedDate,
                flow_type: client_1.CashFlowType.LEGACY,
                direction: inflow.gt(new client_1.Prisma.Decimal('0')) ? client_1.CashFlowDirection.IN : client_1.CashFlowDirection.OUT,
                amount: inflow.gt(new client_1.Prisma.Decimal('0')) ? inflow : outflow,
                notes: null,
                bank_account_id: null,
                label: dto.label.trim(),
                inflow,
                outflow,
                balance,
                runway_weeks: runwayWeeks,
            });
        return this.toResponse(plan);
    }
    async getRunwayStatus(currentUser) {
        const plans = await this.cashFlowRepository.findRollingPlans({ org_id: currentUser.org_id });
        const weeklyBurn = plans.reduce((sum, plan) => sum.plus(plan.outflow), new client_1.Prisma.Decimal('0'));
        const averageWeeklyBurn = plans.length > 0
            ? weeklyBurn.div(new client_1.Prisma.Decimal(plans.length.toString()))
            : new client_1.Prisma.Decimal('0');
        const cashBalance = await this.cashFlowRepository.totalActiveCash(currentUser.org_id);
        const runway = this.calculateRunwayWeeks(cashBalance, averageWeeklyBurn) ?? 0;
        if (runway < 4) {
            return { runway_weeks: runway, severity: 'CRITICAL', threshold_warn: 8, threshold_critical: 4 };
        }
        if (runway < 8) {
            return { runway_weeks: runway, severity: 'WARN', threshold_warn: 8, threshold_critical: 4 };
        }
        return { runway_weeks: runway, severity: 'INFO', threshold_warn: 8, threshold_critical: 4 };
    }
    async resolvePeriodIds(orgId, params) {
        if (params.period_id) {
            return [params.period_id];
        }
        const activePeriod = await this.cashFlowRepository.findActivePeriod(orgId);
        const fiscalYearId = activePeriod?.fiscal_year_id;
        if (!fiscalYearId) {
            return [];
        }
        if (params.ytd) {
            const currentMonth = new Date().getMonth() + 1;
            const periods = await this.cashFlowRepository.findPeriodsByRange(orgId, fiscalYearId, 1, currentMonth);
            return periods.map((p) => p.id);
        }
        if (params.quarter && params.quarter >= 1 && params.quarter <= 4) {
            const start = (params.quarter - 1) * 3 + 1;
            const end = start + 2;
            const periods = await this.cashFlowRepository.findPeriodsByRange(orgId, fiscalYearId, start, end);
            return periods.map((p) => p.id);
        }
        if (params.from_period && params.to_period) {
            const from = await this.cashFlowRepository.findPeriodDetails(params.from_period, orgId);
            const to = await this.cashFlowRepository.findPeriodDetails(params.to_period, orgId);
            if (!from || !to || from.fiscal_year_id !== to.fiscal_year_id) {
                return [];
            }
            const min = Math.min(from.period_number, to.period_number);
            const max = Math.max(from.period_number, to.period_number);
            const periods = await this.cashFlowRepository.findPeriodsByRange(orgId, from.fiscal_year_id, min, max);
            return periods.map((p) => p.id);
        }
        return [];
    }
    calculateRunwayWeeks(cashBalance, weeklyBurn) {
        if (weeklyBurn.lte(new client_1.Prisma.Decimal('0'))) {
            return null;
        }
        const runway = cashBalance.div(weeklyBurn);
        return Number(runway.toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP));
    }
    toResponse(plan) {
        return {
            id: plan.id,
            period_id: plan.period_id,
            week_number: plan.week_number,
            planned_date: plan.planned_date,
            flow_type: plan.flow_type,
            direction: plan.direction,
            amount: plan.amount.toString(),
            bank_account_id: plan.bank_account_id,
            notes: plan.notes,
            label: plan.label,
            inflow: plan.inflow.toString(),
            outflow: plan.outflow.toString(),
            balance: plan.balance.toString(),
            runway_weeks: plan.runway_weeks,
            created_at: plan.created_at,
        };
    }
};
exports.CashFlowService = CashFlowService;
exports.CashFlowService = CashFlowService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_flow_repository_1.CashFlowRepository])
], CashFlowService);
//# sourceMappingURL=cash-flow.service.js.map