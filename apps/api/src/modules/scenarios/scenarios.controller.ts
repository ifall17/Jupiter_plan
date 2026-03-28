import {
  Body,
  Controller,
  Delete,
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
import { ScenarioStatus } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ScenariosService, ScenarioCurrentUser } from './scenarios.service';
import { CreateScenarioDto } from './dto/create-scenario.dto';
import { AddHypothesisDto } from './dto/add-hypothesis.dto';
import { CompareScenariosDto } from './dto/compare-scenarios.dto';
import { CalculateScenarioDto } from './dto/calculate-scenario.dto';
import { ScenarioResponseDto } from './dto/scenario-response.dto';

@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async list(
    @Req() req: Request,
    @Query('status') status?: ScenarioStatus,
    @Query('fiscal_year_id') fiscalYearId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponseDto<ScenarioResponseDto>> {
    return this.scenariosService.listScenarios({
      currentUser: this.getCurrentUser(req),
      status,
      fiscal_year_id: fiscalYearId,
      page: this.parsePositiveInt(page),
      limit: this.parsePositiveInt(limit),
    });
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async getById(@Req() req: Request, @Param('id') id: string): Promise<ScenarioResponseDto> {
    return this.scenariosService.getScenarioById(this.getCurrentUser(req), id);
  }

  @Post()
  @HttpCode(201)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async create(@Req() req: Request, @Body() dto: CreateScenarioDto): Promise<ScenarioResponseDto> {
    return this.scenariosService.createScenario(this.getCurrentUser(req), dto);
  }

  @Put(':id/hypotheses')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async upsertHypotheses(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AddHypothesisDto,
  ): Promise<ScenarioResponseDto> {
    return this.scenariosService.addHypotheses(this.getCurrentUser(req), id, dto);
  }

  @Post(':id/calculate')
  @HttpCode(202)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async calculate(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CalculateScenarioDto,
  ): Promise<{ scenario_id: string; status: 'PROCESSING' }> {
    return this.scenariosService.calculateScenario(this.getCurrentUser(req), id, dto);
  }

  @Post(':id/save')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async save(@Req() req: Request, @Param('id') id: string): Promise<ScenarioResponseDto> {
    return this.scenariosService.saveScenario(this.getCurrentUser(req), id, this.extractIp(req));
  }

  @Post('compare')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async compare(
    @Req() req: Request,
    @Body() dto: CompareScenariosDto,
  ): Promise<{ scenarios: ScenarioResponseDto[]; snapshots_by_scenario: Record<string, unknown> }> {
    return this.scenariosService.compareScenarios(this.getCurrentUser(req), dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async delete(@Req() req: Request, @Param('id') id: string): Promise<{ success: true }> {
    return this.scenariosService.deleteScenario(this.getCurrentUser(req), id);
  }

  private getCurrentUser(req: Request): ScenarioCurrentUser {
    const user = req.user as ScenarioCurrentUser | undefined;
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
