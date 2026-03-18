import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { UserRole } from '@shared/enums';
import { CashFlowService, CashFlowCurrentUser } from './cash-flow.service';
import { CreateCashFlowPlanDto } from './dto/create-cash-flow-plan.dto';
import { CashFlowResponseDto } from './dto/cash-flow-response.dto';
import { CreateCashFlowEntryDto } from './dto/create-cash-flow-entry.dto';

@Controller(['cashflow', 'cash-flow'])
export class CashFlowController {
  constructor(private readonly cashFlowService: CashFlowService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async getCashFlow(
    @Req() req: Request,
    @Query('period_id') periodId?: string,
    @Query('ytd') ytd?: string,
    @Query('quarter') quarter?: string,
    @Query('from_period') fromPeriod?: string,
    @Query('to_period') toPeriod?: string,
  ) {
    const quarterNumber = quarter ? Number.parseInt(quarter, 10) : undefined;
    return this.cashFlowService.getRollingPlan({
      org_id: this.getCurrentUser(req).org_id,
      period_id: periodId,
      ytd: ytd === 'true',
      quarter: Number.isNaN(quarterNumber ?? Number.NaN) ? undefined : quarterNumber,
      from_period: fromPeriod,
      to_period: toPeriod,
    });
  }

  @Get('entries')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async listEntries(
    @Req() req: Request,
    @Query('fiscal_year_id') fiscalYearId?: string,
    @Query('period_id') periodId?: string,
  ): Promise<CashFlowResponseDto[]> {
    return this.cashFlowService.listRollingPlan({
      currentUser: this.getCurrentUser(req),
      fiscal_year_id: fiscalYearId,
      period_id: periodId,
    });
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async createOrUpdate(@Req() req: Request, @Body() dto: CreateCashFlowPlanDto): Promise<CashFlowResponseDto> {
    return this.cashFlowService.createOrUpdatePlan(this.getCurrentUser(req), dto);
  }

  @Get('plans')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async listPlans(
    @Req() req: Request,
    @Query('period_id') periodId?: string,
    @Query('ytd') ytd?: string,
    @Query('quarter') quarter?: string,
    @Query('from_period') fromPeriod?: string,
    @Query('to_period') toPeriod?: string,
  ): Promise<CashFlowResponseDto[]> {
    const quarterNumber = quarter ? Number.parseInt(quarter, 10) : undefined;
    return this.cashFlowService.listPlans(this.getCurrentUser(req), {
      period_id: periodId,
      ytd: ytd === 'true',
      quarter: Number.isNaN(quarterNumber ?? Number.NaN) ? undefined : quarterNumber,
      from_period: fromPeriod,
      to_period: toPeriod,
    });
  }

  @Post('plans')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async createPlanEntry(@Req() req: Request, @Body() dto: CreateCashFlowEntryDto): Promise<CashFlowResponseDto> {
    return this.cashFlowService.createPlannedEntry(this.getCurrentUser(req), dto);
  }

  @Delete('plans/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async deletePlan(@Req() req: Request, @Param('id') id: string): Promise<{ success: true }> {
    return this.cashFlowService.deletePlan(id, this.getCurrentUser(req).org_id);
  }

  @Get('runway')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async runway(@Req() req: Request) {
    return this.cashFlowService.getRunwayStatus(this.getCurrentUser(req));
  }

  private getCurrentUser(req: Request): CashFlowCurrentUser {
    const user = req.user as CashFlowCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
