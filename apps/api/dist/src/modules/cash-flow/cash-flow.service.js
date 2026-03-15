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
    async listRollingPlan(params) {
        const plans = await this.cashFlowRepository.findRollingPlans({
            org_id: params.currentUser.org_id,
            fiscal_year_id: params.fiscal_year_id,
            period_id: params.period_id,
        });
        return plans.map((plan) => this.toResponse(plan));
    }
    async createOrUpdatePlan(currentUser, dto) {
        const inflow = new client_1.Prisma.Decimal(dto.inflow);
        const outflow = new client_1.Prisma.Decimal(dto.outflow);
        const balance = inflow.minus(outflow);
        const cashBalance = await this.cashFlowRepository.totalActiveCash(currentUser.org_id);
        const runwayWeeks = this.calculateRunwayWeeks(cashBalance, outflow);
        const existing = await this.cashFlowRepository.findByPeriodAndWeek(currentUser.org_id, dto.period_id, dto.week_number);
        const plan = existing
            ? await this.cashFlowRepository.update(existing.id, currentUser.org_id, {
                label: dto.label.trim(),
                inflow,
                outflow,
                balance,
                runway_weeks: runwayWeeks,
            })
            : await this.cashFlowRepository.create({
                org_id: currentUser.org_id,
                period_id: dto.period_id,
                week_number: dto.week_number,
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