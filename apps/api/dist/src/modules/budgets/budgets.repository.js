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
exports.BudgetsRepository = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const base_repository_1 = require("../../common/repositories/base.repository");
let BudgetsRepository = class BudgetsRepository extends base_repository_1.BaseRepository {
    constructor(prisma) {
        super(prisma);
        this.prisma = prisma;
    }
    async findOne(id, orgId) {
        const budget = await this.findByIdInOrg(id, orgId);
        if (!budget) {
            throw new Error('BUDGET_NOT_FOUND');
        }
        return budget;
    }
    async findMany(orgId, page, limit) {
        const { skip, take } = this.paginate(page, limit);
        const { items, total } = await this.findPaginated({ org_id: orgId, skip, take });
        return {
            data: items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async create(data) {
        const created = await this.prisma.budget.create({
            data: {
                org_id: data.org_id ?? '',
                fiscal_year_id: data.fiscal_year_id ?? '',
                parent_budget_id: data.parent_budget_id ?? null,
                name: data.name ?? '',
                version: data.version ?? 1,
                status: data.status ?? client_1.BudgetStatus.DRAFT,
                is_reference: data.is_reference ?? false,
            },
            include: { budget_lines: true },
        });
        return created;
    }
    async update(id, orgId, data) {
        await this.prisma.budget.updateMany({
            where: { id, org_id: orgId },
            data: {
                parent_budget_id: data.parent_budget_id,
                name: data.name,
                status: data.status,
                is_reference: data.is_reference,
                submitted_at: data.submitted_at,
                submitted_by: data.submitted_by,
                approved_at: data.approved_at,
                approved_by: data.approved_by,
                locked_at: data.locked_at,
                locked_by: data.locked_by,
                rejection_comment: data.rejection_comment,
            },
        });
        const updated = await this.findByIdInOrg(id, orgId);
        if (!updated) {
            throw new Error('BUDGET_NOT_FOUND');
        }
        return updated;
    }
    async updateMany(where, data) {
        await this.prisma.budget.updateMany({ where, data });
    }
    async softDelete(_id, _orgId) {
        throw new Error('NOT_SUPPORTED');
    }
    async findByIdInOrg(id, orgId) {
        return this.prisma.budget.findFirst({
            where: { id, org_id: orgId },
            include: {
                budget_lines: {
                    orderBy: { account_code: 'asc' },
                },
            },
        });
    }
    async findPaginated(params) {
        const where = { org_id: params.org_id };
        if (params.fiscal_year_id) {
            where.fiscal_year_id = params.fiscal_year_id;
        }
        if (params.status) {
            where.status = params.status;
        }
        const [items, total] = await this.prisma.$transaction([
            this.prisma.budget.findMany({
                where,
                skip: params.skip,
                take: params.take,
                orderBy: { created_at: 'desc' },
                include: {
                    budget_lines: {
                        orderBy: { account_code: 'asc' },
                    },
                },
            }),
            this.prisma.budget.count({ where }),
        ]);
        return { items, total };
    }
    async getNextVersion(orgId, fiscalYearId) {
        const last = await this.prisma.budget.findFirst({
            where: { org_id: orgId, fiscal_year_id: fiscalYearId },
            orderBy: { version: 'desc' },
            select: { version: true },
        });
        return (last?.version ?? 0) + 1;
    }
    async upsertBudgetLines(budgetId, orgId, userId, lines) {
        await this.prisma.$transaction(async (tx) => {
            for (const line of lines) {
                if (line.id) {
                    await tx.budgetLine.updateMany({
                        where: {
                            id: line.id,
                            budget_id: budgetId,
                            org_id: orgId,
                        },
                        data: {
                            period_id: line.period_id,
                            account_code: line.account_code,
                            account_label: line.account_label,
                            department: line.department,
                            line_type: line.line_type,
                            amount_budget: line.amount_budget,
                        },
                    });
                    continue;
                }
                await tx.budgetLine.create({
                    data: {
                        budget_id: budgetId,
                        org_id: orgId,
                        period_id: line.period_id,
                        account_code: line.account_code,
                        account_label: line.account_label,
                        department: line.department,
                        line_type: line.line_type,
                        amount_budget: line.amount_budget,
                        created_by: userId,
                    },
                });
            }
        });
    }
    async setStatus(budgetId, orgId, data) {
        await this.prisma.budget.updateMany({
            where: { id: budgetId, org_id: orgId },
            data,
        });
    }
    async deleteBudget(budgetId, orgId) {
        await this.prisma.$transaction(async (tx) => {
            await tx.budgetLine.deleteMany({
                where: {
                    budget_id: budgetId,
                    org_id: orgId,
                },
            });
            await tx.budget.deleteMany({
                where: {
                    id: budgetId,
                    org_id: orgId,
                },
            });
        });
    }
    async getContributorDepartments(userId) {
        const rows = await this.prisma.userDepartmentScope.findMany({
            where: {
                user_id: userId,
                can_read: true,
            },
            select: { department: true },
        });
        return rows.map((row) => row.department);
    }
};
exports.BudgetsRepository = BudgetsRepository;
exports.BudgetsRepository = BudgetsRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BudgetsRepository);
//# sourceMappingURL=budgets.repository.js.map