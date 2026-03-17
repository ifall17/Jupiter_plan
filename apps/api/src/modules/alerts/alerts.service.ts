import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertSeverity, PeriodStatus } from '@prisma/client';
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
      ytd?: boolean;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponseDto<AlertResponseDto>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;

      let periodFilter: Record<string, unknown> = {};
      if (params.ytd) {
        const ytdIds = await this.resolveYTDPeriodIds(params.currentUser.org_id);
        if (ytdIds.length > 0) {
          periodFilter = { period_id: { in: ytdIds } };
        }
      } else if (params.period_id) {
        periodFilter = { period_id: params.period_id };
      }

      const where = {
        org_id: params.currentUser.org_id,
        ...(typeof params.is_read === 'boolean' ? { is_read: params.is_read } : {}),
        ...(params.severity ? { severity: params.severity } : {}),
        ...periodFilter,
      };

    const [alerts, total] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where,
        include: { kpi: true },
        orderBy: [
          { is_read: 'asc' },
          { severity: 'desc' },
          { created_at: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.alert.count({ where }),
    ]);

    return {
      data: alerts.map((alert) => ({
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

  private async resolveYTDPeriodIds(orgId: string): Promise<string[]> {
    const currentMonth = new Date().getMonth() + 1;
    const activePeriod = await this.prisma.period.findFirst({
      where: { org_id: orgId, status: PeriodStatus.OPEN },
      select: { fiscal_year_id: true },
      orderBy: { period_number: 'desc' },
    });
    const periods = await this.prisma.period.findMany({
      where: {
        org_id: orgId,
        ...(activePeriod ? { fiscal_year_id: activePeriod.fiscal_year_id } : {}),
        period_number: { lte: currentMonth },
      },
      select: { id: true },
      orderBy: { period_number: 'asc' },
    });
    return periods.map((p) => p.id);
  }

  async markAsRead(currentUser: AlertsCurrentUser, alertId: string): Promise<{ success: true }> {
    const updated = await this.prisma.alert.updateMany({
      where: {
        id: alertId,
        org_id: currentUser.org_id,
      },
      data: { is_read: true },
    });

    if (updated.count === 0) {
      throw new NotFoundException();
    }

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
}
