import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BudgetStatus } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { DeptGuard } from '../../common/guards/dept.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { BudgetsService, BudgetCurrentUser } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetLineDto } from './dto/update-budget-line.dto';
import { ApproveBudgetDto } from './dto/approve-budget.dto';
import { RejectBudgetDto } from './dto/reject-budget.dto';
import { BudgetResponseDto } from './dto/budget-response.dto';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async list(
    @Req() req: Request,
    @Query('fiscal_year_id') fiscalYearId?: string,
    @Query('status') status?: BudgetStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponseDto<BudgetResponseDto>> {
    return this.budgetsService.listBudgets({
      currentUser: this.getCurrentUser(req),
      fiscal_year_id: fiscalYearId,
      status,
      page: this.parsePositiveInt(page),
      limit: this.parsePositiveInt(limit),
    });
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async getById(@Req() req: Request, @Param('id') id: string): Promise<BudgetResponseDto> {
    return this.budgetsService.getBudgetById(this.getCurrentUser(req), id);
  }

  @Post()
  @HttpCode(201)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async create(@Req() req: Request, @Body() dto: CreateBudgetDto): Promise<BudgetResponseDto> {
    return this.budgetsService.createBudget(this.getCurrentUser(req), dto, this.extractIp(req));
  }

  @Put(':id/lines')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard, DeptGuard)
  async updateLines(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetLineDto,
  ): Promise<BudgetResponseDto> {
    return this.budgetsService.updateLines(this.getCurrentUser(req), id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async submit(@Req() req: Request, @Param('id') id: string): Promise<BudgetResponseDto> {
    return this.budgetsService.submitBudget(this.getCurrentUser(req), id, this.extractIp(req));
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async approve(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() _dto: ApproveBudgetDto,
  ): Promise<BudgetResponseDto> {
    return this.budgetsService.approveBudget(this.getCurrentUser(req), id, this.extractIp(req));
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async reject(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: RejectBudgetDto,
  ): Promise<BudgetResponseDto> {
    return this.budgetsService.rejectBudget(this.getCurrentUser(req), id, dto, this.extractIp(req));
  }

  @Post(':id/lock')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async lock(@Req() req: Request, @Param('id') id: string): Promise<BudgetResponseDto> {
    return this.budgetsService.lockBudget(this.getCurrentUser(req), id, this.extractIp(req));
  }

  @Get(':id/variance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async variance(@Req() req: Request, @Param('id') id: string) {
    return this.budgetsService.getVariance(this.getCurrentUser(req), id);
  }

  private getCurrentUser(req: Request): BudgetCurrentUser {
    const user = req.user as BudgetCurrentUser | undefined;
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

  private extractIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown'
    );
  }
}
