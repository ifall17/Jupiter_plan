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
exports.UsersRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const base_repository_1 = require("../../common/repositories/base.repository");
const enums_1 = require("../../shared/enums");
let UsersRepository = class UsersRepository extends base_repository_1.BaseRepository {
    constructor(prisma) {
        super(prisma);
        this.prisma = prisma;
    }
    async findOne(id, orgId) {
        const user = await this.findByIdInOrg(id, orgId);
        if (!user) {
            throw new Error('USER_NOT_FOUND');
        }
        return user;
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
        const created = await this.prisma.user.create({
            data: {
                org_id: data.org_id ?? '',
                email: data.email ?? '',
                first_name: data.first_name ?? '',
                last_name: data.last_name ?? '',
                role: (data.role ?? enums_1.UserRole.LECTEUR),
                password_hash: data.password_hash ?? '',
            },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                role: true,
                org_id: true,
                is_active: true,
                last_login_at: true,
                created_at: true,
            },
        });
        return this.toSharedUser(created);
    }
    async update(id, orgId, data) {
        const updated = await this.updateUserByIdInOrg(id, orgId, data);
        if (!updated) {
            throw new Error('USER_NOT_FOUND');
        }
        return updated;
    }
    async softDelete(id, orgId) {
        await this.setActiveState(id, orgId, false);
    }
    async findPaginated(params) {
        const where = this.buildWhere(params.org_id, params.role, params.is_active, params.search);
        const [items, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                skip: params.skip,
                take: params.take,
                orderBy: { created_at: 'desc' },
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    role: true,
                    org_id: true,
                    is_active: true,
                    last_login_at: true,
                    created_at: true,
                    department_scopes: {
                        select: { department: true, can_read: true, can_write: true },
                    },
                },
            }),
            this.prisma.user.count({ where }),
        ]);
        return {
            items: items.map((item) => this.toSharedUser(item)),
            total,
        };
    }
    async findByIdInOrg(userId, orgId) {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, org_id: orgId },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                role: true,
                org_id: true,
                is_active: true,
                last_login_at: true,
                created_at: true,
                department_scopes: {
                    select: { department: true, can_read: true, can_write: true },
                },
            },
        });
        return user ? this.toSharedUser(user) : null;
    }
    async findByEmailInOrg(email, orgId) {
        return this.prisma.user.findFirst({
            where: { email, org_id: orgId },
            select: { id: true },
        });
    }
    async findForPasswordCheck(userId, orgId) {
        return this.prisma.user.findFirst({
            where: { id: userId, org_id: orgId },
            select: {
                id: true,
                org_id: true,
                email: true,
                password_hash: true,
            },
        });
    }
    async createInvitedUser(data) {
        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    org_id: data.org_id,
                    email: data.email,
                    first_name: data.first_name,
                    last_name: data.last_name,
                    role: data.role,
                    password_hash: data.password_hash,
                    is_active: true,
                },
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    role: true,
                    org_id: true,
                    is_active: true,
                    last_login_at: true,
                    created_at: true,
                },
            });
            if (data.department && data.role === enums_1.UserRole.CONTRIBUTEUR) {
                await tx.userDepartmentScope.create({
                    data: {
                        user_id: user.id,
                        department: data.department,
                        can_read: true,
                        can_write: true,
                    },
                });
            }
            return this.findByIdInOrg(user.id, data.org_id);
        });
    }
    async updateUserByIdInOrg(userId, orgId, data) {
        await this.prisma.user.updateMany({
            where: { id: userId, org_id: orgId },
            data: {
                first_name: data.first_name,
                last_name: data.last_name,
                role: data.role,
            },
        });
        return this.findByIdInOrg(userId, orgId);
    }
    async setActiveState(userId, orgId, isActive) {
        await this.prisma.user.updateMany({
            where: { id: userId, org_id: orgId },
            data: { is_active: isActive },
        });
    }
    async clearDepartmentScopes(userId) {
        await this.prisma.userDepartmentScope.deleteMany({
            where: { user_id: userId },
        });
    }
    async updatePassword(userId, orgId, passwordHash) {
        await this.prisma.user.updateMany({
            where: { id: userId, org_id: orgId },
            data: { password_hash: passwordHash },
        });
    }
    async createAuditLog(data) {
        await this.prisma.auditLog.create({
            data: {
                org_id: data.org_id,
                user_id: data.user_id,
                action: data.action,
                entity_type: data.entity_type,
                entity_id: data.entity_id,
                ip_address: data.ip_address,
                metadata: (data.metadata ?? undefined),
            },
        });
    }
    buildWhere(orgId, role, isActive, search) {
        const where = { org_id: orgId };
        if (role) {
            where.role = role;
        }
        if (typeof isActive === 'boolean') {
            where.is_active = isActive;
        }
        if (search) {
            where.OR = [
                { email: { contains: search, mode: 'insensitive' } },
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } },
            ];
        }
        return where;
    }
    toSharedUser(user) {
        return {
            ...user,
            role: user.role,
        };
    }
};
exports.UsersRepository = UsersRepository;
exports.UsersRepository = UsersRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersRepository);
//# sourceMappingURL=users.repository.js.map