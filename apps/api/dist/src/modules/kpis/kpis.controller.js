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
exports.KpisController = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("../../shared/enums");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const org_guard_1 = require("../../common/guards/org.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const kpis_service_1 = require("./kpis.service");
let KpisController = class KpisController {
    constructor(kpisService) {
        this.kpisService = kpisService;
    }
    async list(req) {
        return this.kpisService.listActiveKpis(this.getCurrentUser(req));
    }
    async values(req, periodId, scenarioId, ytd, quarter, fromPeriod, toPeriod) {
        const quarterNumber = quarter ? Number.parseInt(quarter, 10) : undefined;
        return this.kpisService.getValues(this.getCurrentUser(req), periodId, scenarioId, ytd === 'true', Number.isNaN(quarterNumber ?? Number.NaN) ? undefined : quarterNumber, fromPeriod, toPeriod);
    }
    async calculate(req, periodId) {
        return this.kpisService.calculateForPeriod(this.getCurrentUser(req).org_id, periodId);
    }
    async trend(req, kpiCode, fiscalYearId) {
        return this.kpisService.getTrend(this.getCurrentUser(req), kpiCode, fiscalYearId);
    }
    getCurrentUser(req) {
        const user = req.user;
        if (!user?.sub || !user.org_id) {
            throw new common_1.UnauthorizedException();
        }
        return user;
    }
};
exports.KpisController = KpisController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], KpisController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('values'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('period_id')),
    __param(2, (0, common_1.Query)('scenario_id')),
    __param(3, (0, common_1.Query)('ytd')),
    __param(4, (0, common_1.Query)('quarter')),
    __param(5, (0, common_1.Query)('from_period')),
    __param(6, (0, common_1.Query)('to_period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], KpisController.prototype, "values", null);
__decorate([
    (0, common_1.Post)('calculate'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)('period_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], KpisController.prototype, "calculate", null);
__decorate([
    (0, common_1.Get)('trend'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('kpi_code')),
    __param(2, (0, common_1.Query)('fiscal_year_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], KpisController.prototype, "trend", null);
exports.KpisController = KpisController = __decorate([
    (0, common_1.Controller)('kpis'),
    __metadata("design:paramtypes", [kpis_service_1.KpisService])
], KpisController);
//# sourceMappingURL=kpis.controller.js.map