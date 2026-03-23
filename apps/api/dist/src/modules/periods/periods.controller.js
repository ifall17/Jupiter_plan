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
exports.PeriodsController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const org_guard_1 = require("../../common/guards/org.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const periods_service_1 = require("./periods.service");
let PeriodsController = class PeriodsController {
    constructor(periodsService) {
        this.periodsService = periodsService;
    }
    async findAll(user) {
        return this.periodsService.findAll(user.org_id);
    }
    async findOne(id, user) {
        return this.periodsService.findOne(id, user.org_id);
    }
    async close(id, user) {
        if (!user?.sub || !user?.org_id) {
            throw new common_1.UnauthorizedException();
        }
        return this.periodsService.closePeriod(id, {
            sub: user.sub,
            org_id: user.org_id,
            role: user.role,
        });
    }
};
exports.PeriodsController = PeriodsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.UserRole.SUPER_ADMIN, client_1.UserRole.FPA, client_1.UserRole.CONTRIBUTEUR, client_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PeriodsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.SUPER_ADMIN, client_1.UserRole.FPA, client_1.UserRole.CONTRIBUTEUR, client_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PeriodsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/close'),
    (0, common_1.HttpCode)(202),
    (0, roles_decorator_1.Roles)(client_1.UserRole.SUPER_ADMIN, client_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PeriodsController.prototype, "close", null);
exports.PeriodsController = PeriodsController = __decorate([
    (0, common_1.Controller)('periods'),
    __metadata("design:paramtypes", [periods_service_1.PeriodsService])
], PeriodsController);
//# sourceMappingURL=periods.controller.js.map