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
    @Query('ytd') ytd?: string,
    @Query('quarter') quarter?: string,
    @Query('from_period') fromPeriod?: string,
    @Query('to_period') toPeriod?: string,
  ): Promise<DashboardResponseDto> {
    const quarterNumber = quarter ? Number.parseInt(quarter, 10) : undefined;
    return this.dashboardService.getDashboard(
      this.getCurrentUser(req),
      periodId,
      ytd === 'true',
      Number.isNaN(quarterNumber ?? Number.NaN) ? undefined : quarterNumber,
      fromPeriod,
      toPeriod,
    );
  }

  @Get('monthly')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async getMonthly(@Req() req: Request): Promise<{
    monthly: Array<{ month: string; revenue: number; expenses: number; ebitda: number }>;
    expensesByDept: Array<{ name: string; value: number }>;
    budgetVsActualByDept: Array<{ department: string; budget: number; actual: number }>;
  }> {
    const currentUser = this.getCurrentUser(req);
    return this.dashboardService.getMonthlyData(currentUser.org_id);
  }

  private getCurrentUser(req: Request): DashboardCurrentUser {
    const user = req.user as DashboardCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
