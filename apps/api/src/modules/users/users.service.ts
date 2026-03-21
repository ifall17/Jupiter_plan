import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { UserRole, AuditAction } from '@shared/enums';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { UsersRepository } from './users.repository';
import { UserResponseDto } from './dto/user-response.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RedisService } from '../../redis/redis.service';

export const DEFAULT_PAGE_LIMIT = 20;

const ERROR_CODES = {
  INSUFFICIENT_PERMISSIONS: 'AUTH_004',
  USER_NOT_FOUND: 'USER_001',
  EMAIL_ALREADY_EXISTS: 'USER_002',
  CANNOT_DEACTIVATE_SELF: 'USER_003',
  DEPARTMENT_REQUIRED: 'USER_004',
  USER_DELETE_BLOCKED: 'USER_005',
  INVALID_CREDENTIALS: 'AUTH_001',
} as const;

export interface CurrentUserPayload {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly redisService: RedisService,
    @InjectQueue('notif-queue') private readonly notifQueue: Queue,
  ) {}

  async listUsers(params: {
    currentUser: CurrentUserPayload;
    role?: UserRole;
    is_active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponseDto<UserResponseDto>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : DEFAULT_PAGE_LIMIT;
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
      data: items.map((item: {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: UserRole;
        org_id: string;
        is_active: boolean;
        last_login_at: Date | null;
        created_at: Date;
        department_scopes?: Array<{ department: string; can_read: boolean; can_write: boolean }>;
      }) => this.toUserResponse(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(currentUser: CurrentUserPayload, userId: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findByIdInOrg(userId, currentUser.org_id);
    if (!user) {
      throw new NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
    }

    return this.toUserResponse(user);
  }

  async inviteUser(
    currentUser: CurrentUserPayload,
    dto: InviteUserDto,
    ipAddress?: string,
  ): Promise<UserResponseDto> {
    if (dto.role === UserRole.CONTRIBUTEUR && !dto.department?.trim()) {
      throw new BadRequestException({
        code: ERROR_CODES.DEPARTMENT_REQUIRED,
        message: 'Department is required for contributeur role.',
      });
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersRepository.findByEmailInOrg(email, currentUser.org_id);
    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
        message: 'Email already exists in organization.',
      });
    }

    const temporaryPassword = randomBytes(12).toString('hex');
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
      throw new InternalServerErrorException('Unable to create user.');
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
      action: AuditAction.USER_CREATE,
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

  async updateUser(
    currentUser: CurrentUserPayload,
    userId: string,
    dto: UpdateUserDto,
    ipAddress?: string,
  ): Promise<UserResponseDto> {
    const existing = await this.usersRepository.findByIdInOrg(userId, currentUser.org_id);
    if (!existing) {
      throw new NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
    }

    if (currentUser.sub === userId && dto.role && dto.role !== existing.role) {
      throw new BadRequestException({
        code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        message: 'Insufficient permissions.',
      });
    }

    const nextRole = dto.role ?? existing.role;
    const nextDepartment = dto.department?.trim();

    if (
      nextRole === UserRole.CONTRIBUTEUR &&
      !nextDepartment &&
      (!existing.department_scopes || existing.department_scopes.length === 0)
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.DEPARTMENT_REQUIRED,
        message: 'Department scope is required for contributeur role.',
      });
    }

    if (nextRole !== UserRole.CONTRIBUTEUR && existing.role === UserRole.CONTRIBUTEUR) {
      await this.usersRepository.clearDepartmentScopes(existing.id);
    }

    if (nextRole === UserRole.CONTRIBUTEUR && nextDepartment) {
      await this.usersRepository.replaceDepartmentScopes(existing.id, nextDepartment);
    }

    const updated = await this.usersRepository.updateUserByIdInOrg(userId, currentUser.org_id, {
      first_name: dto.first_name?.trim(),
      last_name: dto.last_name?.trim(),
      role: dto.role,
    });

    if (!updated) {
      throw new NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
    }

    await this.usersRepository.createAuditLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.USER_UPDATE,
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

  async toggleUser(
    currentUser: CurrentUserPayload,
    userId: string,
    ipAddress?: string,
  ): Promise<{ success: true; is_active: boolean }> {
    const user = await this.usersRepository.findByIdInOrg(userId, currentUser.org_id);
    if (!user) {
      throw new NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
    }

    if (currentUser.sub === user.id) {
      throw new BadRequestException({
        code: ERROR_CODES.CANNOT_DEACTIVATE_SELF,
        message: 'Cannot deactivate your own account.',
      });
    }

    const nextState = !user.is_active;
    await this.usersRepository.setActiveState(user.id, currentUser.org_id, nextState);

    if (!nextState) {
      try {
        await this.redisService.del(`refresh:${user.id}`);
      } catch {
        throw new InternalServerErrorException('Unable to invalidate session.');
      }
    }

    await this.usersRepository.createAuditLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: nextState ? AuditAction.USER_ACTIVATE : AuditAction.USER_DEACTIVATE,
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

  async deleteUser(
    currentUser: CurrentUserPayload,
    userId: string,
    ipAddress?: string,
  ): Promise<{ success: true }> {
    const user = await this.usersRepository.findByIdInOrg(userId, currentUser.org_id);
    if (!user) {
      throw new NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
    }

    if (currentUser.sub === user.id) {
      throw new BadRequestException({
        code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        message: 'Cannot delete your own account.',
      });
    }

    const blockers = await this.usersRepository.getDeletionBlockers(user.id, currentUser.org_id);
    if (blockers.length > 0) {
      throw new BadRequestException({
        code: ERROR_CODES.USER_DELETE_BLOCKED,
        message: 'User cannot be deleted because related records exist.',
        blockers,
      });
    }

    try {
      await this.redisService.del(`refresh:${user.id}`);
    } catch {
      throw new InternalServerErrorException('Unable to invalidate session.');
    }

    await this.usersRepository.createAuditLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.USER_UPDATE,
      entity_type: 'user',
      entity_id: user.id,
      ip_address: ipAddress,
      metadata: { event_type: 'USER_DELETE', outcome: 'SUCCESS', deleted_email: user.email },
    });

    await this.usersRepository.deleteUserByIdInOrg(user.id, currentUser.org_id);
    return { success: true };
  }

  async getMe(currentUser: CurrentUserPayload): Promise<UserResponseDto> {
    const user = await this.usersRepository.findByIdInOrg(currentUser.sub, currentUser.org_id);
    if (!user) {
      throw new NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
    }
    return this.toUserResponse(user);
  }

  async changeMyPassword(
    currentUser: CurrentUserPayload,
    dto: ChangePasswordDto,
    ipAddress?: string,
  ): Promise<{ success: true }> {
    if (dto.new_password !== dto.confirm_password) {
      throw new BadRequestException({
        code: 'USER_005',
        message: 'Password confirmation does not match.',
      });
    }

    const user = await this.usersRepository.findForPasswordCheck(currentUser.sub, currentUser.org_id);
    if (!user) {
      throw new NotFoundException({ code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found.' });
    }

    const isCurrentValid = await argon2.verify(user.password_hash, dto.current_password);
    if (!isCurrentValid) {
      throw new UnauthorizedException({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid credentials.',
      });
    }

    const newHash = await argon2.hash(dto.new_password, { type: argon2.argon2id });
    await this.usersRepository.updatePassword(user.id, currentUser.org_id, newHash);

    try {
      await this.redisService.del(`refresh:${user.id}`);
    } catch {
      throw new InternalServerErrorException('Unable to invalidate session.');
    }

    await this.usersRepository.createAuditLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.PASSWORD_CHANGE,
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

  private async enqueueInviteEmail(payload: {
    email: string;
    first_name: string;
    last_name: string;
    temporary_password: string;
    org_id: string;
  }): Promise<void> {
    try {
      await this.notifQueue.add('user-invite-email', payload, {
        removeOnComplete: 100,
        removeOnFail: 100,
      });
    } catch {
      throw new InternalServerErrorException('Unable to enqueue invitation email.');
    }
  }

  private toUserResponse(user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    org_id: string;
    is_active: boolean;
    last_login_at: Date | null;
    created_at: Date;
    department_scopes?: Array<{ department: string; can_read: boolean; can_write: boolean }>;
  }): UserResponseDto {
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
      department_scope: user.role === UserRole.CONTRIBUTEUR ? user.department_scopes ?? [] : null,
    };
  }

  private logEvent(eventType: string, payload: Record<string, unknown>): void {
    this.logger.log({
      timestamp: new Date().toISOString(),
      event_type: eventType,
      ...payload,
    });
  }
}
