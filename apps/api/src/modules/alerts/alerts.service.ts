import { Injectable } from '@nestjs/common';
import { AlertSeverity } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AlertResponseDto } from './dto/alert-response.dto';

export interface AlertsCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAlerts(params: {
    currentUser: AlertsCurrentUser;
    is_read?: boolean;
    severity?: AlertSeverity;
    period_id?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponseDto<AlertResponseDto>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where = {
      org_id: params.currentUser.org_id,
      ...(typeof params.is_read === 'boolean' ? { is_read: params.is_read } : {}),
      ...(params.severity ? { severity: params.severity } : {}),
      ...(params.period_id ? { period_id: params.period_id } : {}),
    };

    const [alerts, total] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where,
        include: { kpi: true },
        skip,
        take: limit,
      }),
      this.prisma.alert.count({ where }),
    ]);

    const sorted = alerts.sort((a, b) => {
      const severityDiff = this.getSeverityRank(b.severity) - this.getSeverityRank(a.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return b.created_at.getTime() - a.created_at.getTime();
    });

    return {
      data: sorted.map((alert) => ({
        id: alert.id,
        kpi_id: alert.kpi_id,
        kpi_code: alert.kpi.code,
        kpi_label: alert.kpi.label,
        period_id: alert.period_id,
        severity: alert.severity,
        message: alert.message,
        is_read: alert.is_read,
        created_at: alert.created_at,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markAsRead(currentUser: AlertsCurrentUser, alertId: string): Promise<{ success: true }> {
    await this.prisma.alert.updateMany({
      where: {
        id: alertId,
        org_id: currentUser.org_id,
      },
      data: { is_read: true },
    });

    return { success: true };
  }

  async markAllAsRead(currentUser: AlertsCurrentUser): Promise<{ updated: number }> {
    const result = await this.prisma.alert.updateMany({
      where: {
        org_id: currentUser.org_id,
        is_read: false,
      },
      data: { is_read: true },
    });

    return { updated: result.count };
  }

  private getSeverityRank(severity: AlertSeverity): number {
    if (severity === AlertSeverity.CRITICAL) {
      return 3;
    }
    if (severity === AlertSeverity.WARN) {
      return 2;
    }
    return 1;
  }
}
