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
exports.ScenariosController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const org_guard_1 = require("../../common/guards/org.guard");
const scenarios_service_1 = require("./scenarios.service");
const create_scenario_dto_1 = require("./dto/create-scenario.dto");
const add_hypothesis_dto_1 = require("./dto/add-hypothesis.dto");
const compare_scenarios_dto_1 = require("./dto/compare-scenarios.dto");
let ScenariosController = class ScenariosController {
    constructor(scenariosService) {
        this.scenariosService = scenariosService;
    }
    async list(req, status, fiscalYearId, page, limit) {
        return this.scenariosService.listScenarios({
            currentUser: this.getCurrentUser(req),
            status,
            fiscal_year_id: fiscalYearId,
            page: this.parsePositiveInt(page),
            limit: this.parsePositiveInt(limit),
        });
    }
    async getById(req, id) {
        return this.scenariosService.getScenarioById(this.getCurrentUser(req), id);
    }
    async create(req, dto) {
        return this.scenariosService.createScenario(this.getCurrentUser(req), dto);
    }
    async upsertHypotheses(req, id, dto) {
        return this.scenariosService.addHypotheses(this.getCurrentUser(req), id, dto);
    }
    async calculate(req, id) {
        return this.scenariosService.calculateScenario(this.getCurrentUser(req), id);
    }
    async save(req, id) {
        return this.scenariosService.saveScenario(this.getCurrentUser(req), id, this.extractIp(req));
    }
    async compare(req, dto) {
        return this.scenariosService.compareScenarios(this.getCurrentUser(req), dto);
    }
    async delete(req, id) {
        return this.scenariosService.deleteScenario(this.getCurrentUser(req), id);
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
exports.ScenariosController = ScenariosController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('fiscal_year_id')),
    __param(3, (0, common_1.Query)('page')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ScenariosController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ScenariosController.prototype, "getById", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(201),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_scenario_dto_1.CreateScenarioDto]),
    __metadata("design:returntype", Promise)
], ScenariosController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id/hypotheses'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, add_hypothesis_dto_1.AddHypothesisDto]),
    __metadata("design:returntype", Promise)
], ScenariosController.prototype, "upsertHypotheses", null);
__decorate([
    (0, common_1.Post)(':id/calculate'),
    (0, common_1.HttpCode)(202),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ScenariosController.prototype, "calculate", null);
__decorate([
    (0, common_1.Post)(':id/save'),
    (0, common_1.HttpCode)(200),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ScenariosController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('compare'),
    (0, common_1.HttpCode)(200),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA, enums_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, compare_scenarios_dto_1.CompareScenariosDto]),
    __metadata("design:returntype", Promise)
], ScenariosController.prototype, "compare", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(200),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN, enums_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ScenariosController.prototype, "delete", null);
exports.ScenariosController = ScenariosController = __decorate([
    (0, common_1.Controller)('scenarios'),
    __metadata("design:paramtypes", [scenarios_service_1.ScenariosService])
], ScenariosController);
//# sourceMappingURL=scenarios.controller.js.map