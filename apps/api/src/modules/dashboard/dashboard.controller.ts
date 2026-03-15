import { Controller, Get, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '@shared/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { DashboardCurrentUser, DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async getDashboard(
    @Req() req: Request,
    @Query('period_id') periodId?: string,
  ): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboard(this.getCurrentUser(req), periodId);
  }

  private getCurrentUser(req: Request): DashboardCurrentUser {
    const user = req.user as DashboardCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
