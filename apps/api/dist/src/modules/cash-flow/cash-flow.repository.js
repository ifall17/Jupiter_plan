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
exports.CashFlowRepository = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const base_repository_1 = require("../../common/repositories/base.repository");
let CashFlowRepository = class CashFlowRepository extends base_repository_1.BaseRepository {
    constructor(prisma) {
        super(prisma);
        this.prisma = prisma;
    }
    async findOne(id, orgId) {
        const plan = await this.findByIdInOrg(id, orgId);
        if (!plan) {
            throw new Error('CASHFLOW_NOT_FOUND');
        }
        return plan;
    }
    async findMany(orgId, page, limit) {
        const { skip, take } = this.paginate(page, limit);
        const items = await this.prisma.cashFlowPlan.findMany({
            where: { org_id: orgId },
            orderBy: [{ period_id: 'asc' }, { week_number: 'asc' }],
            skip,
            take,
        });
        const total = await this.prisma.cashFlowPlan.count({ where: { org_id: orgId } });
        return {
            data: items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async create(data) {
        return this.prisma.cashFlowPlan.create({
            data: {
                org_id: data.org_id ?? '',
                period_id: data.period_id ?? '',
                week_number: data.week_number ?? 1,
                label: data.label ?? '',
                inflow: data.inflow ?? new client_1.Prisma.Decimal('0'),
                outflow: data.outflow ?? new client_1.Prisma.Decimal('0'),
                balance: data.balance ?? new client_1.Prisma.Decimal('0'),
                runway_weeks: data.runway_weeks ?? null,
            },
        });
    }
    async update(id, orgId, data) {
        await this.prisma.cashFlowPlan.updateMany({
            where: { id, org_id: orgId },
            data: {
                label: data.label,
                inflow: data.inflow,
                outflow: data.outflow,
                balance: data.balance,
                runway_weeks: data.runway_weeks,
            },
        });
        return this.findOne(id, orgId);
    }
    async softDelete(_id, _orgId) {
        throw new Error('NOT_SUPPORTED');
    }
    async findByIdInOrg(id, orgId) {
        return this.prisma.cashFlowPlan.findFirst({ where: { id, org_id: orgId } });
    }
    async findRollingPlans(params) {
        return this.prisma.cashFlowPlan.findMany({
            where: {
                org_id: params.org_id,
                ...(params.period_id ? { period_id: params.period_id } : {}),
                ...(params.fiscal_year_id
                    ? {
                        period: {
                            fiscal_year_id: params.fiscal_year_id,
                        },
                    }
                    : {}),
            },
            orderBy: [{ period_id: 'asc' }, { week_number: 'asc' }],
            take: 13,
        });
    }
    async findByPeriodAndWeek(orgId, periodId, weekNumber) {
        return this.prisma.cashFlowPlan.findFirst({
            where: {
                org_id: orgId,
                period_id: periodId,
                week_number: weekNumber,
            },
        });
    }
    async totalActiveCash(orgId) {
        const result = await this.prisma.bankAccount.aggregate({
            where: { org_id: orgId, is_active: true },
            _sum: { balance: true },
        });
        return result._sum.balance ?? new client_1.Prisma.Decimal('0');
    }
};
exports.CashFlowRepository = CashFlowRepository;
exports.CashFlowRepository = CashFlowRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CashFlowRepository);
//# sourceMappingURL=cash-flow.repository.js.map