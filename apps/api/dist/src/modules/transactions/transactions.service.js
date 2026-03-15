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
        const where = {
            org_id: params.currentUser.org_id,
            ...(params.period_id ? { period_id: params.period_id } : {}),
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
    async create(currentUser, dto) {
        await this.ensurePeriodBelongsToOrg(dto.period_id, currentUser.org_id);
        const amount = Number.parseFloat(dto.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new common_1.BadRequestException('Amount must be positive');
        }
        const signedAmount = dto.line_type === client_1.LineType.EXPENSE ? -amount : amount;
        const transaction = await this.prisma.transaction.create({
            data: {
                org_id: currentUser.org_id,
                period_id: dto.period_id,
                account_code: dto.account_code.trim(),
                account_label: dto.label.trim(),
                department: dto.department,
                amount: new client_1.Prisma.Decimal(signedAmount.toFixed(2)),
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
        const numericAmount = Number(item.amount);
        return {
            id: item.id,
            period_id: item.period_id,
            transaction_date: item.created_at,
            account_code: item.account_code,
            label: item.account_label,
            department: item.department,
            line_type: numericAmount >= 0 ? client_1.LineType.REVENUE : client_1.LineType.EXPENSE,
            amount: Math.abs(numericAmount).toFixed(2),
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