import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../common/repositories/base.repository';
import { Prisma, UserRole as PrismaUserRole } from '@prisma/client';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { UserRole } from '@shared/enums';

type RepoUser = {
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
};

@Injectable()
export class UsersRepository extends BaseRepository<RepoUser> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findOne(id: string, orgId: string) {
    const user = await this.findByIdInOrg(id, orgId);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }
    return user;
  }

  async findMany(orgId: string, page: number, limit: number): Promise<PaginatedResponseDto<RepoUser>> {
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

  async create(data: Partial<{
    org_id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    password_hash: string;
  }>) {
    const created = await this.prisma.user.create({
      data: {
        org_id: data.org_id ?? '',
        email: data.email ?? '',
        first_name: data.first_name ?? '',
        last_name: data.last_name ?? '',
        role: (data.role ?? UserRole.LECTEUR) as PrismaUserRole,
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

  async update(
    id: string,
    orgId: string,
    data: Partial<{ first_name: string; last_name: string; role: UserRole }>,
  ) {
    const updated = await this.updateUserByIdInOrg(id, orgId, data);
    if (!updated) {
      throw new Error('USER_NOT_FOUND');
    }
    return updated;
  }

  async softDelete(id: string, orgId: string): Promise<void> {
    await this.setActiveState(id, orgId, false);
  }

  async findPaginated(params: {
    org_id: string;
    role?: UserRole;
    is_active?: boolean;
    search?: string;
    skip: number;
    take: number;
  }) {
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

  async findByIdInOrg(userId: string, orgId: string) {
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

  async findByEmailInOrg(email: string, orgId: string) {
    return this.prisma.user.findFirst({
      where: { email, org_id: orgId },
      select: { id: true },
    });
  }

  async findForPasswordCheck(userId: string, orgId: string) {
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

  async createInvitedUser(data: {
    org_id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    password_hash: string;
    department?: string;
  }) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          org_id: data.org_id,
          email: data.email,
          first_name: data.first_name,
          last_name: data.last_name,
          role: data.role as PrismaUserRole,
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

      if (data.department && data.role === UserRole.CONTRIBUTEUR) {
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

  async updateUserByIdInOrg(
    userId: string,
    orgId: string,
    data: { first_name?: string; last_name?: string; role?: UserRole },
  ) {
    await this.prisma.user.updateMany({
      where: { id: userId, org_id: orgId },
      data: {
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role as PrismaUserRole | undefined,
      },
    });

    return this.findByIdInOrg(userId, orgId);
  }

  async setActiveState(userId: string, orgId: string, isActive: boolean) {
    await this.prisma.user.updateMany({
      where: { id: userId, org_id: orgId },
      data: { is_active: isActive },
    });
  }

  async clearDepartmentScopes(userId: string): Promise<void> {
    await this.prisma.userDepartmentScope.deleteMany({
      where: { user_id: userId },
    });
  }

  async updatePassword(userId: string, orgId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, org_id: orgId },
      data: { password_hash: passwordHash },
    });
  }

  async createAuditLog(data: {
    org_id: string;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    ip_address?: string;
    metadata?: Prisma.JsonValue;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        org_id: data.org_id,
        user_id: data.user_id,
        action: data.action as never,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        ip_address: data.ip_address,
        metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private buildWhere(orgId: string, role?: UserRole, isActive?: boolean, search?: string) {
    const where: Prisma.UserWhereInput = { org_id: orgId };

    if (role) {
      where.role = role as PrismaUserRole;
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

  private toSharedUser<T extends { role: PrismaUserRole }>(
    user: T,
  ): Omit<T, 'role'> & { role: UserRole } {
    return {
      ...user,
      role: user.role as unknown as UserRole,
    };
  }
}
