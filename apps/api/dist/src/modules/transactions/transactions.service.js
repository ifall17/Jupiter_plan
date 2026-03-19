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
exports.TransactionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let TransactionsService = class TransactionsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(params) {
        const page = params.page && params.page > 0 ? params.page : 1;
        const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
        const skip = (page - 1) * limit;
        const periodIds = await this.resolvePeriodIds(params.currentUser.org_id, {
            period_id: params.period_id,
            ytd: params.ytd,
            quarter: params.quarter,
            from_period: params.from_period,
            to_period: params.to_period,
        });
        const periodFilter = periodIds.length > 0
            ? { period_id: { in: periodIds } }
            : params.period_id
                ? { period_id: params.period_id }
                : {};
        const where = {
            org_id: params.currentUser.org_id,
            ...periodFilter,
            ...(params.department ? { department: params.department } : {}),
            ...(params.line_type
                ? params.line_type === client_1.LineType.REVENUE
                    ? { amount: { gt: 0 } }
                    : { amount: { lt: 0 } }
                : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.transaction.findMany({
                where,
                include: { period: { select: { id: true, label: true } } },
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.transaction.count({ where }),
        ]);
        return {
            data: items.map((item) => this.toResponse(item)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async resolvePeriodIds(orgId, params) {
        if (params.period_id) {
            return [params.period_id];
        }
        const activePeriod = await this.prisma.period.findFirst({
            where: { org_id: orgId, status: client_1.PeriodStatus.OPEN },
            select: { fiscal_year_id: true },
            orderBy: { period_number: 'desc' },
        });
        const fiscalYearId = activePeriod?.fiscal_year_id;
        if (!fiscalYearId) {
            return [];
        }
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
    async create(currentUser, dto) {
        await this.ensurePeriodBelongsToOrg(dto.period_id, currentUser.org_id);
        let amount;
        try {
            amount = new client_1.Prisma.Decimal(dto.amount);
        }
        catch {
            throw new common_1.BadRequestException('Amount must be positive');
        }
        if (amount.lte(new client_1.Prisma.Decimal('0'))) {
            throw new common_1.BadRequestException('Amount must be positive');
        }
        const signedAmount = dto.line_type === client_1.LineType.EXPENSE ? amount.abs().negated() : amount.abs();
        const transaction = await this.prisma.transaction.create({
            data: {
                org_id: currentUser.org_id,
                period_id: dto.period_id,
                account_code: dto.account_code.trim(),
                account_label: dto.label.trim(),
                department: dto.department,
                amount: signedAmount.toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP),
                created_at: new Date(dto.transaction_date),
            },
            include: { period: { select: { id: true, label: true } } },
        });
        return this.toResponse(transaction);
    }
    async validateBatch(currentUser, ids) {
        const result = await this.prisma.transaction.updateMany({
            where: { id: { in: ids }, org_id: currentUser.org_id },
            data: { is_validated: true, validated_by: currentUser.sub },
        });
        return { updated: result.count };
    }
    async ensurePeriodBelongsToOrg(periodId, orgId) {
        const period = await this.prisma.period.findFirst({
            where: { id: periodId, fiscal_year: { org_id: orgId } },
            select: { id: true },
        });
        if (!period) {
            throw new common_1.UnauthorizedException();
        }
    }
    toResponse(item) {
        const isRevenue = item.amount.gte(new client_1.Prisma.Decimal('0'));
        return {
            id: item.id,
            period_id: item.period_id,
            transaction_date: item.created_at,
            account_code: item.account_code,
            label: item.account_label,
            department: item.department,
            line_type: isRevenue ? client_1.LineType.REVENUE : client_1.LineType.EXPENSE,
            amount: item.amount.abs().toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP).toString(),
            is_validated: item.is_validated,
            created_at: item.created_at,
        };
    }
};
exports.TransactionsService = TransactionsService;
exports.TransactionsService = TransactionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TransactionsService);
//# sourceMappingURL=transactions.service.js.map