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
exports.OrganizationsController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const org_guard_1 = require("../../common/guards/org.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const prisma_service_1 = require("../../prisma/prisma.service");
const update_organization_dto_1 = require("./dto/update-organization.dto");
let OrganizationsController = class OrganizationsController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getCurrent(req) {
        const user = req.user;
        if (!user?.sub || !user.org_id) {
            throw new common_1.UnauthorizedException();
        }
        const org = await this.prisma.organization.findUnique({
            where: { id: user.org_id },
            select: { id: true, name: true, currency: true },
        });
        if (!org) {
            throw new common_1.NotFoundException('Organisation introuvable');
        }
        const fiscalYear = await this.prisma.fiscalYear.findFirst({
            where: { org_id: user.org_id, status: client_1.FiscalStatus.ACTIVE },
            orderBy: { start_date: 'desc' },
        });
        const period = await this.prisma.period.findFirst({
            where: {
                org_id: user.org_id,
                status: client_1.PeriodStatus.OPEN,
                ...(fiscalYear ? { fiscal_year_id: fiscalYear.id } : {}),
            },
            orderBy: { period_number: 'desc' },
        });
        return {
            id: org.id,
            name: org.name,
            currency: org.currency,
            current_period_id: period?.id ?? null,
            current_period_label: period?.label ?? null,
            fiscal_year_id: fiscalYear?.id ?? null,
            fiscal_year_label: fiscalYear?.label ?? null,
        };
    }
    async updateCurrent(req, dto) {
        const user = req.user;
        if (!user?.sub || !user.org_id) {
            throw new common_1.UnauthorizedException();
        }
        const updated = await this.prisma.organization.update({
            where: { id: user.org_id },
            data: { name: dto.name.trim() },
            select: { id: true, name: true, currency: true },
        });
        const fiscalYear = await this.prisma.fiscalYear.findFirst({
            where: { org_id: user.org_id, status: client_1.FiscalStatus.ACTIVE },
            orderBy: { start_date: 'desc' },
            select: { id: true, label: true },
        });
        const period = await this.prisma.period.findFirst({
            where: {
                org_id: user.org_id,
                status: client_1.PeriodStatus.OPEN,
                ...(fiscalYear ? { fiscal_year_id: fiscalYear.id } : {}),
            },
            orderBy: { period_number: 'desc' },
            select: { id: true, label: true },
        });
        return {
            id: updated.id,
            name: updated.name,
            currency: updated.currency,
            current_period_id: period?.id ?? null,
            current_period_label: period?.label ?? null,
            fiscal_year_id: fiscalYear?.id ?? null,
            fiscal_year_label: fiscalYear?.label ?? null,
        };
    }
};
exports.OrganizationsController = OrganizationsController;
__decorate([
    (0, common_1.Get)('current'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "getCurrent", null);
__decorate([
    (0, common_1.Patch)('current'),
    (0, common_1.HttpCode)(200),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_organization_dto_1.UpdateOrganizationDto]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "updateCurrent", null);
exports.OrganizationsController = OrganizationsController = __decorate([
    (0, common_1.Controller)('organizations'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrganizationsController);
//# sourceMappingURL=organizations.controller.js.map