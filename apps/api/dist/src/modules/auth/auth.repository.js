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
exports.AuthRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let AuthRepository = class AuthRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findUserByEmailForAuth(email) {
        return this.prisma.user.findFirst({
            where: { email },
            select: {
                id: true,
                org_id: true,
                email: true,
                password_hash: true,
                first_name: true,
                last_name: true,
                role: true,
                is_active: true,
                last_login_at: true,
                department_scopes: {
                    select: {
                        department: true,
                        can_read: true,
                        can_write: true,
                    },
                },
            },
        });
    }
    async findUserProfileById(userId, orgId) {
        return this.prisma.user.findFirst({
            where: { id: userId, org_id: orgId },
            select: {
                id: true,
                email: true,
                role: true,
                org_id: true,
                first_name: true,
                last_name: true,
                last_login_at: true,
            },
        });
    }
    async updateLastLoginAt(userId, at) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { last_login_at: at },
        });
    }
    async createAuditLog(params) {
        await this.prisma.auditLog.create({
            data: {
                org_id: params.org_id,
                user_id: params.user_id,
                action: params.action,
                entity_type: params.entity_type,
                entity_id: params.entity_id,
                ip_address: params.ip_address,
                metadata: params.metadata,
            },
        });
    }
};
exports.AuthRepository = AuthRepository;
exports.AuthRepository = AuthRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuthRepository);
//# sourceMappingURL=auth.repository.js.map