import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '@shared/enums';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async createLog(params: {
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
        action: params.action,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        ip_address: params.ip_address,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
