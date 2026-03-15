import { Injectable } from '@nestjs/common';
import { AuditAction as PrismaAuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction } from '@shared/enums';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmailForAuth(email: string) {
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

  async findUserProfileById(userId: string, orgId: string) {
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

  async updateLastLoginAt(userId: string, at: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { last_login_at: at },
    });
  }

  async createAuditLog(params: {
    org_id: string;
    user_id?: string;
    action: AuditAction;
    entity_type: string;
    entity_id?: string;
    ip_address?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        org_id: params.org_id,
        user_id: params.user_id,
        action: params.action as unknown as PrismaAuditAction,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        ip_address: params.ip_address,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
