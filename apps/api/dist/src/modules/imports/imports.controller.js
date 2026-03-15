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
exports.ImportsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const org_guard_1 = require("../../common/guards/org.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const imports_service_1 = require("./imports.service");
let ImportsController = class ImportsController {
    constructor(importsService) {
        this.importsService = importsService;
    }
    async upload(req, file, periodId) {
        if (!file) {
            throw new common_1.BadRequestException('file is required');
        }
        if (!periodId) {
            throw new common_1.BadRequestException('period_id is required');
        }
        const user = this.getCurrentUser(req);
        const job = await this.importsService.processImport(file, periodId, user.org_id, user.sub);
        return job;
    }
    async getJob(req, jobId) {
        return this.importsService.getJob(jobId, this.getCurrentUser(req));
    }
    getCurrentUser(req) {
        const user = req.user;
        if (!user?.sub || !user.org_id) {
            throw new common_1.UnauthorizedException();
        }
        return user;
    }
};
exports.ImportsController = ImportsController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.SUPER_ADMIN, client_1.UserRole.FPA, client_1.UserRole.CONTRIBUTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: { fileSize: 10 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)('period_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], ImportsController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(':jobId'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.SUPER_ADMIN, client_1.UserRole.FPA, client_1.UserRole.CONTRIBUTEUR, client_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ImportsController.prototype, "getJob", null);
exports.ImportsController = ImportsController = __decorate([
    (0, common_1.Controller)('imports'),
    __metadata("design:paramtypes", [imports_service_1.ImportsService])
], ImportsController);
//# sourceMappingURL=imports.controller.js.map