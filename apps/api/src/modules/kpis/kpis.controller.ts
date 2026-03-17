import { Body, Controller, Get, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '@shared/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { KpisService, KpiCurrentUser } from './kpis.service';
import { KpiResponseDto } from './dto/kpi-response.dto';
import { KpiValueResponseDto } from './dto/kpi-value-response.dto';

@Controller('kpis')
export class KpisController {
  constructor(private readonly kpisService: KpisService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async list(@Req() req: Request): Promise<KpiResponseDto[]> {
    return this.kpisService.listActiveKpis(this.getCurrentUser(req));
  }

  @Get('values')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async values(
    @Req() req: Request,
     @Query('period_id') periodId?: string,
     @Query('scenario_id') scenarioId?: string,
     @Query('ytd') ytd?: string,
  ): Promise<KpiValueResponseDto[]> {
     return this.kpisService.getValues(this.getCurrentUser(req), periodId, scenarioId, ytd === 'true');
  }

  @Post('calculate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async calculate(
    @Req() req: Request,
    @Body('period_id') periodId: string,
  ): Promise<{ calculated: number; kpis: string[] }> {
    return this.kpisService.calculateForPeriod(
      this.getCurrentUser(req).org_id,
      periodId,
    );
  }

  @Get('trend')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async trend(
    @Req() req: Request,
    @Query('kpi_code') kpiCode: string,
    @Query('fiscal_year_id') fiscalYearId: string,
  ): Promise<{ kpi_code: string; values: Array<{ period: string; value: string; severity: string }> }> {
    return this.kpisService.getTrend(this.getCurrentUser(req), kpiCode, fiscalYearId);
  }

  private getCurrentUser(req: Request): KpiCurrentUser {
    const user = req.user as KpiCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
