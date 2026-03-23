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
const syscohada_mapping_service_1 = require("../../common/services/syscohada-mapping.service");
let TransactionsService = class TransactionsService {
    constructor(prisma, syscohadaMappingService) {
        this.prisma = prisma;
        this.syscohadaMappingService = syscohadaMappingService;
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
        const resolvedLineType = await this.syscohadaMappingService.resolveSingleLineType(dto.account_code, dto.amount, currentUser.org_id);
        const finalLineType = resolvedLineType === 'REVENUE'
            ? client_1.LineType.REVENUE
            : resolvedLineType === 'EXPENSE'
                ? client_1.LineType.EXPENSE
                : dto.line_type;
        const signedAmount = finalLineType === client_1.LineType.EXPENSE ? amount.abs().negated() : amount.abs();
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
        const result = await this.prisma.$transaction(async (trx) => {
            const updateResult = await trx.transaction.updateMany({
                where: { id: { in: ids }, org_id: currentUser.org_id },
                data: { is_validated: true, validated_by: currentUser.sub },
            });
            if (updateResult.count > 0) {
                await this.syncBudgetLines(currentUser.org_id, trx);
            }
            return { updated: updateResult.count };
        });
        return result;
    }
    async update(currentUser, id, dto) {
        const transaction = await this.prisma.transaction.findFirst({
            where: { id, org_id: currentUser.org_id },
        });
        if (!transaction) {
            throw new common_1.BadRequestException('Transaction not found');
        }
        if (transaction.is_validated) {
            throw new common_1.BadRequestException('Cannot modify a validated transaction');
        }
        if (dto.period_id && dto.period_id !== transaction.period_id) {
            await this.ensurePeriodBelongsToOrg(dto.period_id, currentUser.org_id);
        }
        const effectiveAccountCode = dto.account_code ? dto.account_code.trim() : transaction.account_code;
        const shouldRecomputeSignedAmount = Boolean(dto.amount || dto.account_code || dto.line_type);
        let signedAmount = transaction.amount;
        if (shouldRecomputeSignedAmount) {
            let absoluteAmount;
            if (dto.amount) {
                try {
                    absoluteAmount = new client_1.Prisma.Decimal(dto.amount);
                }
                catch {
                    throw new common_1.BadRequestException('Amount must be positive');
                }
                if (absoluteAmount.lte(new client_1.Prisma.Decimal('0'))) {
                    throw new common_1.BadRequestException('Amount must be positive');
                }
            }
            else {
                absoluteAmount = transaction.amount.abs();
            }
            const fallbackLineType = dto.line_type ?? this.getLineTypeFromAmount(transaction.amount);
            const resolvedLineType = await this.syscohadaMappingService.resolveSingleLineType(effectiveAccountCode, absoluteAmount.toString(), currentUser.org_id);
            const finalLineType = resolvedLineType === 'REVENUE'
                ? client_1.LineType.REVENUE
                : resolvedLineType === 'EXPENSE'
                    ? client_1.LineType.EXPENSE
                    : fallbackLineType;
            signedAmount =
                finalLineType === client_1.LineType.EXPENSE ? absoluteAmount.abs().negated() : absoluteAmount.abs();
        }
        const updated = await this.prisma.transaction.update({
            where: { id },
            data: {
                period_id: dto.period_id ?? transaction.period_id,
                account_code: effectiveAccountCode,
                account_label: dto.label ? dto.label.trim() : transaction.account_label,
                department: dto.department ?? transaction.department,
                amount: signedAmount,
                created_at: dto.transaction_date ? new Date(dto.transaction_date) : transaction.created_at,
            },
            include: { period: { select: { id: true, label: true } } },
        });
        return this.toResponse(updated);
    }
    async delete(currentUser, id) {
        const transaction = await this.prisma.transaction.findFirst({
            where: { id, org_id: currentUser.org_id },
        });
        if (!transaction) {
            throw new common_1.BadRequestException('Transaction not found');
        }
        if (transaction.is_validated) {
            throw new common_1.BadRequestException('Cannot delete a validated transaction');
        }
        await this.prisma.transaction.delete({
            where: { id },
        });
        return { success: true };
    }
    async syncBudgetLines(orgId, trx = this.prisma) {
        const periods = await trx.period.findMany({
            where: { organization: { id: orgId } },
            select: { id: true },
        });
        if (periods.length === 0)
            return;
        for (const period of periods) {
            const transactions = await trx.transaction.findMany({
                where: {
                    org_id: orgId,
                    period_id: period.id,
                    is_validated: true,
                },
                select: {
                    account_code: true,
                    account_label: true,
                    department: true,
                    amount: true,
                },
            });
            const grouped = new Map();
            for (const tx of transactions) {
                const key = `${tx.account_code}|${tx.account_label}|${tx.department}`;
                const existing = grouped.get(key) ?? new client_1.Prisma.Decimal('0');
                grouped.set(key, existing.plus(tx.amount));
            }
            for (const [key, totalAmount] of grouped.entries()) {
                const [accountCode, accountLabel, department] = key.split('|');
                const budgetLines = await trx.budgetLine.findMany({
                    where: {
                        org_id: orgId,
                        period_id: period.id,
                        account_code: accountCode,
                        account_label: accountLabel,
                        department: department,
                    },
                    select: { id: true },
                });
                for (const budgetLine of budgetLines) {
                    await trx.budgetLine.update({
                        where: { id: budgetLine.id },
                        data: {
                            amount_actual: totalAmount.abs(),
                        },
                    });
                }
            }
        }
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
    getLineTypeFromAmount(amount) {
        return amount.gte(new client_1.Prisma.Decimal('0')) ? client_1.LineType.REVENUE : client_1.LineType.EXPENSE;
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        syscohada_mapping_service_1.SyscohadaMappingService])
], TransactionsService);
//# sourceMappingURL=transactions.service.js.map