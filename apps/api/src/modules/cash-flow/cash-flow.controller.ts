import {
  Body,
  Controller,
  Get,
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

@Controller('cashflow')
export class CashFlowController {
  constructor(private readonly cashFlowService: CashFlowService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async list(
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
