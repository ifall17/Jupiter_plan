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
var UsersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = exports.DEFAULT_PAGE_LIMIT = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const argon2 = require("argon2");
const crypto_1 = require("crypto");
const enums_1 = require("../../shared/enums");
const users_repository_1 = require("./users.repository");
const redis_service_1 = require("../../redis/redis.service");
exports.DEFAULT_PAGE_LIMIT = 20;
const ERROR_CODES = {
    INSUFFICIENT_PERMISSIONS: 'AUTH_004',
    USER_NOT_FOUND: 'USER_001',
    EMAIL_ALREADY_EXISTS: 'USER_002',
    CANNOT_DEACTIVATE_SELF: 'USER_003',
    DEPARTMENT_REQUIRED: 'USER_004',
    USER_DELETE_BLOCKED: 'USER_005',
    INVALID_CREDENTIALS: 'AUTH_001',
};
let UsersService = UsersService_1 = class UsersService {
    constructor(usersRepository, redisService, notifQueue) {
        this.usersRepository = usersRepository;
        this.redisService = redisService;
        this.notifQueue = notifQueue;
        this.logger = new common_1.Logger(UsersService_1.name);
    }
    async listUsers(params) {
        const page = params.page && params.page > 0 ? params.page : 1;
        const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : exports.DEFAULT_PAGE_LIMIT;
        const skip = (page - 1) * limit;
        const { items, total } = await this.usersRepository.findPaginated({
            org_id: params.currentUser.org_id,
            role: params.role,
            is_active: params.is_active,
            search: params.search?.trim(),
            skip,
            take: limit,
        });
        return {
            data: items.map((item) => this.toUserResponse(item)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async getById(currentUser, userId) {
        const user = await this.usersRepository.findByIdInOrg(userId, currentUser.org_id);
        if (!user) {
            throw new common_1.NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
        }
        return this.toUserResponse(user);
    }
    async inviteUser(currentUser, dto, ipAddress) {
        if (dto.role === enums_1.UserRole.CONTRIBUTEUR && !dto.department?.trim()) {
            throw new common_1.BadRequestException({
                code: ERROR_CODES.DEPARTMENT_REQUIRED,
                message: 'Department is required for contributeur role.',
            });
        }
        const email = dto.email.trim().toLowerCase();
        const existing = await this.usersRepository.findByEmailInOrg(email, currentUser.org_id);
        if (existing) {
            throw new common_1.ConflictException({
                code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
                message: 'Email already exists in organization.',
            });
        }
        const temporaryPassword = (0, crypto_1.randomBytes)(12).toString('hex');
        const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
        const createdUser = await this.usersRepository.createInvitedUser({
            org_id: currentUser.org_id,
            email,
            first_name: dto.first_name.trim(),
            last_name: dto.last_name.trim(),
            role: dto.role,
            password_hash: passwordHash,
            department: dto.department?.trim(),
        });
        if (!createdUser) {
            throw new common_1.InternalServerErrorException('Unable to create user.');
        }
        await this.enqueueInviteEmail({
            email: createdUser.email,
            first_name: createdUser.first_name,
            last_name: createdUser.last_name,
            temporary_password: temporaryPassword,
            org_id: currentUser.org_id,
        });
        await this.usersRepository.createAuditLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.USER_CREATE,
            entity_type: 'user',
            entity_id: createdUser.id,
            ip_address: ipAddress,
            metadata: { event_type: 'USER_CREATE', outcome: 'SUCCESS' },
        });
        this.logEvent('USER_INVITE', {
            user_id: currentUser.sub,
            org_id: currentUser.org_id,
            ip_address: ipAddress,
            outcome: 'SUCCESS',
        });
        return this.toUserResponse(createdUser);
    }
    async updateUser(currentUser, userId, dto, ipAddress) {
        const existing = await this.usersRepository.findByIdInOrg(userId, currentUser.org_id);
        if (!existing) {
            throw new common_1.NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
        }
        if (currentUser.sub === userId && dto.role && dto.role !== existing.role) {
            throw new common_1.BadRequestException({
                code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
                message: 'Insufficient permissions.',
            });
        }
        const nextRole = dto.role ?? existing.role;
        const nextDepartment = dto.department?.trim();
        if (nextRole === enums_1.UserRole.CONTRIBUTEUR &&
            !nextDepartment &&
            (!existing.department_scopes || existing.department_scopes.length === 0)) {
            throw new common_1.BadRequestException({
                code: ERROR_CODES.DEPARTMENT_REQUIRED,
                message: 'Department scope is required for contributeur role.',
            });
        }
        if (nextRole !== enums_1.UserRole.CONTRIBUTEUR && existing.role === enums_1.UserRole.CONTRIBUTEUR) {
            await this.usersRepository.clearDepartmentScopes(existing.id);
        }
        if (nextRole === enums_1.UserRole.CONTRIBUTEUR && nextDepartment) {
            await this.usersRepository.replaceDepartmentScopes(existing.id, nextDepartment);
        }
        const updated = await this.usersRepository.updateUserByIdInOrg(userId, currentUser.org_id, {
            first_name: dto.first_name?.trim(),
            last_name: dto.last_name?.trim(),
            role: dto.role,
        });
        if (!updated) {
            throw new common_1.NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
        }
        await this.usersRepository.createAuditLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.USER_UPDATE,
            entity_type: 'user',
            entity_id: userId,
            ip_address: ipAddress,
            metadata: { event_type: 'USER_UPDATE', outcome: 'SUCCESS' },
        });
        this.logEvent('USER_UPDATE', {
            user_id: currentUser.sub,
            org_id: currentUser.org_id,
            ip_address: ipAddress,
            outcome: 'SUCCESS',
        });
        return this.toUserResponse(updated);
    }
    async toggleUser(currentUser, userId, ipAddress) {
        const user = await this.usersRepository.findByIdInOrg(userId, currentUser.org_id);
        if (!user) {
            throw new common_1.NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
        }
        if (currentUser.sub === user.id) {
            throw new common_1.BadRequestException({
                code: ERROR_CODES.CANNOT_DEACTIVATE_SELF,
                message: 'Cannot deactivate your own account.',
            });
        }
        const nextState = !user.is_active;
        await this.usersRepository.setActiveState(user.id, currentUser.org_id, nextState);
        if (!nextState) {
            try {
                await this.redisService.del(`refresh:${user.id}`);
            }
            catch {
                throw new common_1.InternalServerErrorException('Unable to invalidate session.');
            }
        }
        await this.usersRepository.createAuditLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: nextState ? enums_1.AuditAction.USER_ACTIVATE : enums_1.AuditAction.USER_DEACTIVATE,
            entity_type: 'user',
            entity_id: user.id,
            ip_address: ipAddress,
            metadata: {
                event_type: nextState ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
                outcome: 'SUCCESS',
            },
        });
        return { success: true, is_active: nextState };
    }
    async deleteUser(currentUser, userId, ipAddress) {
        const user = await this.usersRepository.findByIdInOrg(userId, currentUser.org_id);
        if (!user) {
            throw new common_1.NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
        }
        if (currentUser.sub === user.id) {
            throw new common_1.BadRequestException({
                code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
                message: 'Cannot delete your own account.',
            });
        }
        const blockers = await this.usersRepository.getDeletionBlockers(user.id, currentUser.org_id);
        if (blockers.length > 0) {
            throw new common_1.BadRequestException({
                code: ERROR_CODES.USER_DELETE_BLOCKED,
                message: 'User cannot be deleted because related records exist.',
                blockers,
            });
        }
        try {
            await this.redisService.del(`refresh:${user.id}`);
        }
        catch {
            throw new common_1.InternalServerErrorException('Unable to invalidate session.');
        }
        await this.usersRepository.createAuditLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.USER_UPDATE,
            entity_type: 'user',
            entity_id: user.id,
            ip_address: ipAddress,
            metadata: { event_type: 'USER_DELETE', outcome: 'SUCCESS', deleted_email: user.email },
        });
        await this.usersRepository.deleteUserByIdInOrg(user.id, currentUser.org_id);
        return { success: true };
    }
    async getMe(currentUser) {
        const user = await this.usersRepository.findByIdInOrg(currentUser.sub, currentUser.org_id);
        if (!user) {
            throw new common_1.NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
        }
        return this.toUserResponse(user);
    }
    async changeMyPassword(currentUser, dto, ipAddress) {
        if (dto.new_password !== dto.confirm_password) {
            throw new common_1.BadRequestException({
                code: 'USER_005',
                message: 'Password confirmation does not match.',
            });
        }
        const user = await this.usersRepository.findForPasswordCheck(currentUser.sub, currentUser.org_id);
        if (!user) {
            throw new common_1.NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
        }
        const isCurrentValid = await argon2.verify(user.password_hash, dto.current_password);
        if (!isCurrentValid) {
            throw new common_1.UnauthorizedException({
                code: ERROR_CODES.INVALID_CREDENTIALS,
                message: 'Invalid credentials.',
            });
        }
        const newHash = await argon2.hash(dto.new_password, { type: argon2.argon2id });
        await this.usersRepository.updatePassword(user.id, currentUser.org_id, newHash);
        try {
            await this.redisService.del(`refresh:${user.id}`);
        }
        catch {
            throw new common_1.InternalServerErrorException('Unable to invalidate session.');
        }
        await this.usersRepository.createAuditLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.PASSWORD_CHANGE,
            entity_type: 'user',
            entity_id: user.id,
            ip_address: ipAddress,
            metadata: { event_type: 'PASSWORD_CHANGE', outcome: 'SUCCESS' },
        });
        this.logEvent('PASSWORD_CHANGE', {
            user_id: currentUser.sub,
            org_id: currentUser.org_id,
            ip_address: ipAddress,
            outcome: 'SUCCESS',
        });
        return { success: true };
    }
    async enqueueInviteEmail(payload) {
        try {
            await this.notifQueue.add('user-invite-email', payload, {
                removeOnComplete: 100,
                removeOnFail: 100,
            });
        }
        catch {
            throw new common_1.InternalServerErrorException('Unable to enqueue invitation email.');
        }
    }
    toUserResponse(user) {
        return {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            org_id: user.org_id,
            is_active: user.is_active,
            last_login_at: user.last_login_at,
            created_at: user.created_at,
            department_scope: user.role === enums_1.UserRole.CONTRIBUTEUR ? user.department_scopes ?? [] : null,
        };
    }
    logEvent(eventType, payload) {
        this.logger.log({
            timestamp: new Date().toISOString(),
            event_type: eventType,
            ...payload,
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = UsersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bullmq_1.InjectQueue)('notif-queue')),
    __metadata("design:paramtypes", [users_repository_1.UsersRepository,
        redis_service_1.RedisService,
        bullmq_2.Queue])
], UsersService);
//# sourceMappingURL=users.service.js.map