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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetsController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const org_guard_1 = require("../../common/guards/org.guard");
const dept_guard_1 = require("../../common/guards/dept.guard");
const budgets_service_1 = require("./budgets.service");
const create_budget_dto_1 = require("./dto/create-budget.dto");
const update_budget_line_dto_1 = require("./dto/update-budget-line.dto");
const approve_budget_dto_1 = require("./dto/approve-budget.dto");
const reject_budget_dto_1 = require("./dto/reject-budget.dto");
let BudgetsController = class BudgetsController {
    constructor(budgetsService) {
        this.budgetsService = budgetsService;
    }
    async list(req, fiscalYearId, status, page, limit) {
        return this.budgetsService.listBudgets({
            currentUser: this.getCurrentUser(req),
            fiscal_year_id: fiscalYearId,
            status,
            page: this.parsePositiveInt(page),
            limit: this.parsePositiveInt(limit),
        });
    }
    async getById(req, id) {
        return this.budgetsService.getBudgetById(this.getCurrentUser(req), id);
    }
    async create(req, dto) {
        return this.budgetsService.createBudget(this.getCurrentUser(req), dto, this.extractIp(req));
    }
    async updateLines(req, id, dto) {
        return this.budgetsService.updateLines(this.getCurrentUser(req), id, dto);
    }
    async submit(req, id) {
        return this.budgetsService.submitBudget(this.getCurrentUser(req), id, this.extractIp(req));
    }
    async approve(req, id, _dto) {
        return this.budgetsService.approveBudget(this.getCurrentUser(req), id, this.extractIp(req));
    }
    async reject(req, id, dto) {
        return this.budgetsService.rejectBudget(this.getCurrentUser(req), id, dto, this.extractIp(req));
    }
    async lock(req, id) {
        return this.budgetsService.lockBudget(this.getCurrentUser(req), id, this.extractIp(req));
    }
    async variance(req, id) {
        return this.budgetsService.getVariance(this.getCurrentUser(req), id);
    }
    getCurrentUser(req) {
        const user = req.user;
        if (!user?.sub || !user.org_id) {
            throw new common_1.UnauthorizedException();
        }
        return user;
    }
    parsePositiveInt(value) {
        if (!value) {
            return undefined;
        }
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
            return undefined;
        }
        return parsed;
    }
    extractIp(request) {
        return (request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            request.ip ||
            'unknown');
    }
};
exports.BudgetsController = BudgetsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('fiscal_year_id')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('page')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", Promise)
], BudgetsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.CONTRIBUTEUR, enums_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BudgetsController.prototype, "getById", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(201),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_budget_dto_1.CreateBudgetDto]),
    __metadata("design:returntype", Promise)
], BudgetsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id/lines'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.CONTRIBUTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard, dept_guard_1.DeptGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_budget_line_dto_1.UpdateBudgetLineDto]),
    __metadata("design:returntype", Promise)
], BudgetsController.prototype, "updateLines", null);
__decorate([
    (0, common_1.Post)(':id/submit'),
    (0, common_1.HttpCode)(200),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.CONTRIBUTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BudgetsController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, common_1.HttpCode)(200),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, approve_budget_dto_1.ApproveBudgetDto]),
    __metadata("design:returntype", Promise)
], BudgetsController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, common_1.HttpCode)(200),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, reject_budget_dto_1.RejectBudgetDto]),
    __metadata("design:returntype", Promise)
], BudgetsController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)(':id/lock'),
    (0, common_1.HttpCode)(200),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BudgetsController.prototype, "lock", null);
__decorate([
    (0, common_1.Get)(':id/variance'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BudgetsController.prototype, "variance", null);
exports.BudgetsController = BudgetsController = __decorate([
    (0, common_1.Controller)('budgets'),
    __metadata("design:paramtypes", [budgets_service_1.BudgetsService])
], BudgetsController);
//# sourceMappingURL=budgets.controller.js.map