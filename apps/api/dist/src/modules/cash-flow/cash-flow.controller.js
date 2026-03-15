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
exports.CashFlowController = void 0;
const common_1 = require("@nestjs/common");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const org_guard_1 = require("../../common/guards/org.guard");
const enums_1 = require("../../shared/enums");
const cash_flow_service_1 = require("./cash-flow.service");
const create_cash_flow_plan_dto_1 = require("./dto/create-cash-flow-plan.dto");
let CashFlowController = class CashFlowController {
    constructor(cashFlowService) {
        this.cashFlowService = cashFlowService;
    }
    async list(req, fiscalYearId, periodId) {
        return this.cashFlowService.listRollingPlan({
            currentUser: this.getCurrentUser(req),
            fiscal_year_id: fiscalYearId,
            period_id: periodId,
        });
    }
    async createOrUpdate(req, dto) {
        return this.cashFlowService.createOrUpdatePlan(this.getCurrentUser(req), dto);
    }
    async runway(req) {
        return this.cashFlowService.getRunwayStatus(this.getCurrentUser(req));
    }
    getCurrentUser(req) {
        const user = req.user;
        if (!user?.sub || !user.org_id) {
            throw new common_1.UnauthorizedException();
        }
        return user;
    }
};
exports.CashFlowController = CashFlowController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('fiscal_year_id')),
    __param(2, (0, common_1.Query)('period_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CashFlowController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_cash_flow_plan_dto_1.CreateCashFlowPlanDto]),
    __metadata("design:returntype", Promise)
], CashFlowController.prototype, "createOrUpdate", null);
__decorate([
    (0, common_1.Get)('runway'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CashFlowController.prototype, "runway", null);
exports.CashFlowController = CashFlowController = __decorate([
    (0, common_1.Controller)('cashflow'),
    __metadata("design:paramtypes", [cash_flow_service_1.CashFlowService])
], CashFlowController);
//# sourceMappingURL=cash-flow.controller.js.map