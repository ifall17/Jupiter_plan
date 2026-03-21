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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BudgetsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetsService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const audit_service_1 = require("../../common/services/audit.service");
const budgets_repository_1 = require("./budgets.repository");
const BUDGET_ERROR_CODES = {
    BUDGET_EMPTY: 'BUDGET_EMPTY',
    BUDGET_LOCKED: 'BUDGET_LOCKED',
    BUDGET_NOT_LOCKED: 'BUDGET_NOT_LOCKED',
    BUDGET_NOT_SUBMITTABLE: 'BUDGET_NOT_SUBMITTABLE',
    BUDGET_NOT_APPROVABLE: 'BUDGET_NOT_APPROVABLE',
    REJECTION_COMMENT_REQUIRED: 'REJECTION_COMMENT_REQUIRED',
};
let BudgetsService = BudgetsService_1 = class BudgetsService {
    constructor(budgetsRepository, auditService, calcQueue) {
        this.budgetsRepository = budgetsRepository;
        this.auditService = auditService;
        this.calcQueue = calcQueue;
        this.logger = new common_1.Logger(BudgetsService_1.name);
    }
    async listBudgets(params) {
        const page = params.page && params.page > 0 ? params.page : 1;
        const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
        const skip = (page - 1) * limit;
        const { items, total } = await this.budgetsRepository.findPaginated({
            org_id: params.currentUser.org_id,
            fiscal_year_id: params.fiscal_year_id,
            status: params.status,
            skip,
            take: limit,
        });
        return {
            data: items.map((budget) => this.toBudgetResponse(budget)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async getBudgetById(currentUser, budgetId) {
        const budget = await this.budgetsRepository.findByIdInOrg(budgetId, currentUser.org_id);
        if (!budget) {
            throw new common_1.NotFoundException();
        }
        return this.toBudgetResponse(this.filterByRoleAndDepartment(budget, currentUser));
    }
    async createBudget(currentUser, dto, ipAddress) {
        let parent = null;
        if (dto.parent_budget_id) {
            parent = await this.budgetsRepository.findByIdInOrg(dto.parent_budget_id, currentUser.org_id);
            if (!parent || parent.fiscal_year_id !== dto.fiscal_year_id || parent.status !== client_1.BudgetStatus.LOCKED) {
                throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_LOCKED });
            }
        }
        const version = await this.budgetsRepository.getNextVersion(currentUser.org_id, dto.fiscal_year_id);
        const budget = await this.budgetsRepository.create({
            org_id: currentUser.org_id,
            fiscal_year_id: dto.fiscal_year_id,
            parent_budget_id: dto.parent_budget_id ?? null,
            name: dto.name.trim(),
            version,
            status: client_1.BudgetStatus.DRAFT,
        });
        if (parent && parent.budget_lines.length > 0) {
            const linesToCopy = parent.budget_lines.map((line) => ({
                period_id: line.period_id,
                account_code: line.account_code,
                account_label: line.account_label,
                department: line.department,
                line_type: line.line_type,
                amount_budget: line.amount_budget.toString(),
            }));
            await this.budgetsRepository.upsertBudgetLines(budget.id, currentUser.org_id, currentUser.sub, linesToCopy);
        }
        await this.auditService.createLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.BUDGET_CREATE,
            entity_type: 'BUDGET',
            entity_id: budget.id,
            ip_address: ipAddress,
            metadata: {
                from_status: null,
                to_status: client_1.BudgetStatus.DRAFT,
                parent_budget_id: dto.parent_budget_id ?? null,
                lines_copied: parent?.budget_lines.length ?? 0,
            },
        });
        const refreshed = await this.budgetsRepository.findByIdInOrg(budget.id, currentUser.org_id);
        return this.toBudgetResponse(refreshed);
    }
    async updateLines(currentUser, budgetId, dto) {
        const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        if (budget.status === client_1.BudgetStatus.LOCKED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
        }
        if (budget.status !== client_1.BudgetStatus.DRAFT && budget.status !== client_1.BudgetStatus.REJECTED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_SUBMITTABLE });
        }
        if (currentUser.role === enums_1.UserRole.CONTRIBUTEUR) {
            const allowedDepartments = await this.budgetsRepository.getContributorDepartments(currentUser.sub);
            const unauthorized = dto.lines.some((line) => !allowedDepartments.includes(line.department));
            if (unauthorized) {
                throw new common_1.NotFoundException();
            }
        }
        await this.budgetsRepository.upsertBudgetLines(budget.id, currentUser.org_id, currentUser.sub, dto.lines);
        const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
        return this.toBudgetResponse(this.filterByRoleAndDepartment(refreshed, currentUser));
    }
    async submitBudget(currentUser, budgetId, ipAddress) {
        const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        if (budget.status === client_1.BudgetStatus.LOCKED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
        }
        if (budget.status !== client_1.BudgetStatus.DRAFT && budget.status !== client_1.BudgetStatus.REJECTED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_SUBMITTABLE });
        }
        await this.budgetsRepository.setStatus(budget.id, currentUser.org_id, {
            status: client_1.BudgetStatus.SUBMITTED,
            submitted_at: new Date(),
            submitted_by: currentUser.sub,
        });
        await this.auditService.createLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.BUDGET_SUBMIT,
            entity_type: 'BUDGET',
            entity_id: budget.id,
            ip_address: ipAddress,
            metadata: {
                from_status: budget.status,
                to_status: client_1.BudgetStatus.SUBMITTED,
            },
        });
        const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
        return this.toBudgetResponse(this.filterByRoleAndDepartment(refreshed, currentUser));
    }
    async approveBudget(currentUser, budgetId, ipAddress) {
        const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        if (this.hasZeroBudgetedAmount(budget)) {
            throw new common_1.BadRequestException({
                code: BUDGET_ERROR_CODES.BUDGET_EMPTY,
                message: 'Impossible d approuver un budget avec un total budgete egal a 0',
            });
        }
        if (budget.status === client_1.BudgetStatus.LOCKED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
        }
        if (budget.status !== client_1.BudgetStatus.SUBMITTED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_APPROVABLE });
        }
        await this.budgetsRepository.setStatus(budget.id, currentUser.org_id, {
            status: client_1.BudgetStatus.APPROVED,
            approved_at: new Date(),
            approved_by: currentUser.sub,
        });
        await this.calcQueue.add('budget-approved-recalc', { org_id: currentUser.org_id, budget_id: budget.id }, { removeOnComplete: 100, removeOnFail: 100 });
        await this.auditService.createLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.BUDGET_APPROVE,
            entity_type: 'BUDGET',
            entity_id: budget.id,
            ip_address: ipAddress,
            metadata: {
                from_status: budget.status,
                to_status: client_1.BudgetStatus.APPROVED,
            },
        });
        const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
        return this.toBudgetResponse(refreshed);
    }
    async rejectBudget(currentUser, budgetId, dto, ipAddress) {
        const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        if (budget.status === client_1.BudgetStatus.LOCKED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
        }
        if (budget.status !== client_1.BudgetStatus.SUBMITTED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_APPROVABLE });
        }
        if (!dto.rejection_comment?.trim()) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.REJECTION_COMMENT_REQUIRED });
        }
        await this.budgetsRepository.setStatus(budget.id, currentUser.org_id, {
            status: client_1.BudgetStatus.REJECTED,
            rejection_comment: dto.rejection_comment.trim(),
        });
        await this.auditService.createLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.BUDGET_REJECT,
            entity_type: 'BUDGET',
            entity_id: budget.id,
            ip_address: ipAddress,
            metadata: {
                from_status: budget.status,
                to_status: client_1.BudgetStatus.REJECTED,
            },
        });
        const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
        return this.toBudgetResponse(refreshed);
    }
    async lockBudget(currentUser, budgetId, ipAddress) {
        const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        if (this.hasZeroBudgetedAmount(budget)) {
            throw new common_1.BadRequestException({
                code: BUDGET_ERROR_CODES.BUDGET_EMPTY,
                message: 'Impossible de verrouiller un budget avec un total budgete egal a 0',
            });
        }
        if (budget.status === client_1.BudgetStatus.LOCKED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
        }
        if (budget.status !== client_1.BudgetStatus.APPROVED) {
            throw new common_1.BadRequestException({
                code: BUDGET_ERROR_CODES.BUDGET_NOT_APPROVABLE,
                message: 'Le budget doit etre APPROVED pour etre verrouille',
            });
        }
        await this.budgetsRepository.setStatus(budget.id, currentUser.org_id, {
            status: client_1.BudgetStatus.LOCKED,
            locked_at: new Date(),
            locked_by: currentUser.sub,
        });
        await this.auditService.createLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.BUDGET_LOCK,
            entity_type: 'BUDGET',
            entity_id: budget.id,
            ip_address: ipAddress,
            metadata: {
                from_status: budget.status,
                to_status: client_1.BudgetStatus.LOCKED,
            },
        });
        const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
        return this.toBudgetResponse(refreshed);
    }
    async setAsReference(currentUser, budgetId) {
        const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        if (budget.status !== client_1.BudgetStatus.LOCKED) {
            throw new common_1.BadRequestException({
                code: BUDGET_ERROR_CODES.BUDGET_NOT_LOCKED,
                message: 'Seul un budget VERROUILLE peut etre marque comme reference',
            });
        }
        await this.budgetsRepository.updateMany({
            org_id: currentUser.org_id,
            fiscal_year_id: budget.fiscal_year_id,
            is_reference: true,
        }, { is_reference: false });
        await this.budgetsRepository.update(budget.id, currentUser.org_id, {
            is_reference: true,
        });
        const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
        return this.toBudgetResponse(refreshed);
    }
    async deleteLine(currentUser, budgetId, lineId) {
        const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        if (budget.status !== client_1.BudgetStatus.DRAFT && budget.status !== client_1.BudgetStatus.REJECTED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
        }
        if (currentUser.role === enums_1.UserRole.CONTRIBUTEUR) {
            const line = budget.budget_lines.find((l) => l.id === lineId);
            const allowedDepartments = await this.budgetsRepository.getContributorDepartments(currentUser.sub);
            if (!line || !allowedDepartments.includes(line.department)) {
                throw new common_1.NotFoundException();
            }
        }
        await this.budgetsRepository.deleteLineById(budgetId, currentUser.org_id, lineId);
        const refreshed = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        return this.toBudgetResponse(this.filterByRoleAndDepartment(refreshed, currentUser));
    }
    async deleteBudget(currentUser, budgetId) {
        const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        if (budget.status === client_1.BudgetStatus.LOCKED || budget.status === client_1.BudgetStatus.APPROVED) {
            throw new common_1.BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
        }
        await this.budgetsRepository.deleteBudget(budget.id, currentUser.org_id);
        return { success: true };
    }
    async getVariance(currentUser, budgetId) {
        const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);
        const scoped = this.filterByRoleAndDepartment(budget, currentUser);
        return {
            budget_id: scoped.id,
            status: scoped.status,
            lines: scoped.budget_lines.map((line) => {
                const variance = line.amount_actual.minus(line.amount_budget);
                const variancePct = line.amount_budget.equals(0)
                    ? new client_1.Prisma.Decimal(0)
                    : variance.div(line.amount_budget).mul(100);
                return {
                    line_id: line.id,
                    period_id: line.period_id,
                    account_code: line.account_code,
                    account_label: line.account_label,
                    department: line.department,
                    amount_budget: line.amount_budget.toString(),
                    amount_actual: line.amount_actual.toString(),
                    variance: variance.toString(),
                    variance_pct: variancePct.toFixed(2),
                };
            }),
        };
    }
    async ensureOwnedBudget(budgetId, orgId) {
        const budget = await this.budgetsRepository.findByIdInOrg(budgetId, orgId);
        if (!budget) {
            throw new common_1.NotFoundException();
        }
        return budget;
    }
    filterByRoleAndDepartment(budget, currentUser) {
        if (currentUser.role !== enums_1.UserRole.CONTRIBUTEUR) {
            return budget;
        }
        const allowedDepartments = new Set((currentUser.department_scope ?? [])
            .filter((scope) => scope.can_read)
            .map((scope) => scope.department));
        const filteredLines = budget.budget_lines.filter((line) => allowedDepartments.has(line.department));
        return {
            ...budget,
            budget_lines: filteredLines,
        };
    }
    hasZeroBudgetedAmount(budget) {
        const totalBudgeted = budget.budget_lines.reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal(0));
        return totalBudgeted.eq(new client_1.Prisma.Decimal(0));
    }
    toBudgetResponse(budget) {
        return {
            id: budget.id,
            name: budget.name,
            status: budget.status,
            version: budget.version,
            fiscal_year_id: budget.fiscal_year_id,
            parent_budget_id: budget.parent_budget_id,
            is_reference: budget.is_reference,
            submitted_at: budget.submitted_at,
            submitted_by: budget.submitted_by,
            approved_at: budget.approved_at,
            approved_by: budget.approved_by,
            locked_at: budget.locked_at,
            rejection_comment: budget.rejection_comment,
            created_at: budget.created_at,
            lines: budget.budget_lines.map((line) => {
                const variance = line.amount_actual.minus(line.amount_budget);
                return {
                    id: line.id,
                    period_id: line.period_id,
                    period_label: line.period?.label ?? '',
                    account_code: line.account_code,
                    account_label: line.account_label,
                    department: line.department,
                    line_type: line.line_type,
                    amount_budget: line.amount_budget.toString(),
                    amount_actual: line.amount_actual.toString(),
                    variance: variance.toString(),
                };
            }),
        };
    }
};
exports.BudgetsService = BudgetsService;
exports.BudgetsService = BudgetsService = BudgetsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bullmq_1.InjectQueue)('calc-queue')),
    __metadata("design:paramtypes", [budgets_repository_1.BudgetsRepository,
        audit_service_1.AuditService,
        bullmq_2.Queue])
], BudgetsService);
//# sourceMappingURL=budgets.service.js.map