import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AlertSeverity } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AlertsService, AlertsCurrentUser } from './alerts.service';
import { AlertResponseDto } from './dto/alert-response.dto';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async list(
    @Req() req: Request,
    @Query('is_read') isRead?: string,
    @Query('severity') severity?: AlertSeverity,
    @Query('period_id') periodId?: string,
      @Query('ytd') ytd?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponseDto<AlertResponseDto>> {
    return this.alertsService.listAlerts({
      currentUser: this.getCurrentUser(req),
      is_read: this.parseBoolean(isRead),
      severity,
      period_id: periodId,
        ytd: ytd === 'true',
      page: this.parsePositiveInt(page),
      limit: this.parsePositiveInt(limit),
    });
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  async readAll(@Req() req: Request): Promise<{ updated: number }> {
    return this.alertsService.markAllAsRead(this.getCurrentUser(req));
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  async read(@Req() req: Request, @Param('id') id: string): Promise<{ success: true }> {
    return this.alertsService.markAsRead(this.getCurrentUser(req), id);
  }

  private getCurrentUser(req: Request): AlertsCurrentUser {
    const user = req.user as AlertsCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private parsePositiveInt(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }

  private parseBoolean(value?: string): boolean | undefined {
    if (!value) {
      return undefined;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return undefined;
  }
}
