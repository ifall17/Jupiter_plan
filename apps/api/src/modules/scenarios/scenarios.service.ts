import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScenarioStatus } from '@prisma/client';
import { AuditAction, UserRole } from '@shared/enums';
import { MAX_SCENARIO_COMPARE } from '../../common/constants/business.constants';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AuditService } from '../../common/services/audit.service';
import { ScenariosRepository, RepoScenario, ScenarioCalculationModeValue } from './scenarios.repository';
import { CreateScenarioDto } from './dto/create-scenario.dto';
import { AddHypothesisDto } from './dto/add-hypothesis.dto';
import { CompareScenariosDto } from './dto/compare-scenarios.dto';
import { CalculateScenarioDto } from './dto/calculate-scenario.dto';
import { ScenarioResponseDto } from './dto/scenario-response.dto';

const SCENARIO_ERRORS = {
  SCENARIO_BASE_REQUIRED: 'SCENARIO_BASE_REQUIRED',
  SCENARIO_MAX_COMPARE: 'SCENARIO_MAX_COMPARE',
  SCENARIO_LOCKED: 'SCENARIO_LOCKED',
} as const;

export interface ScenarioCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class ScenariosService {
  constructor(
    private readonly scenariosRepository: ScenariosRepository,
    private readonly auditService: AuditService,
    @InjectQueue('calc-queue') private readonly calcQueue: Queue,
  ) {}

  async listScenarios(params: {
    currentUser: ScenarioCurrentUser;
    status?: ScenarioStatus;
    fiscal_year_id?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponseDto<ScenarioResponseDto>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const { items, total } = await this.scenariosRepository.findPaginated({
      org_id: params.currentUser.org_id,
      role: params.currentUser.role,
      status: params.status,
      fiscal_year_id: params.fiscal_year_id,
      skip,
      take: limit,
    });

    return {
      data: items.map((item) => this.toResponse(item, params.currentUser.role)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getScenarioById(currentUser: ScenarioCurrentUser, scenarioId: string): Promise<ScenarioResponseDto> {
    const scenario = await this.scenariosRepository.findByIdInOrg(scenarioId, currentUser.org_id, currentUser.role);
    if (!scenario) {
      throw new NotFoundException();
    }

    return this.toResponse(scenario, currentUser.role);
  }

  async createScenario(currentUser: ScenarioCurrentUser, dto: CreateScenarioDto): Promise<ScenarioResponseDto> {
    const approved = await this.scenariosRepository.isBudgetApproved(dto.budget_id, currentUser.org_id);
    if (!approved) {
      throw new BadRequestException({ code: SCENARIO_ERRORS.SCENARIO_BASE_REQUIRED });
    }

    const created = await this.scenariosRepository.createScenario({
      org_id: currentUser.org_id,
      budget_id: dto.budget_id,
      name: dto.name.trim(),
      type: dto.type,
      calculation_mode: 'GLOBAL',
      created_by: currentUser.sub,
    });

    return this.toResponse(created, currentUser.role);
  }

  async addHypotheses(
    currentUser: ScenarioCurrentUser,
    scenarioId: string,
    dto: AddHypothesisDto,
  ): Promise<ScenarioResponseDto> {
    const scenario = await this.ensureOwnedScenario(currentUser, scenarioId);
    if (scenario.status !== ScenarioStatus.DRAFT) {
      throw new BadRequestException({
        code: 'SCENARIO_NOT_EDITABLE',
        message: 'Les hypothèses ne peuvent être modifiées que pour un scénario en brouillon (DRAFT).',
      });
    }

    await this.scenariosRepository.replaceHypotheses(
      scenario.id,
      currentUser.org_id,
      dto.hypotheses.map((hypothesis) => ({
        label: hypothesis.label.trim(),
        parameter: hypothesis.parameter.trim(),
        value: hypothesis.value,
        unit: hypothesis.unit,
      })),
    );

    const refreshed = await this.ensureOwnedScenario(currentUser, scenario.id);
    return this.toResponse(refreshed, currentUser.role);
  }

  async calculateScenario(
    currentUser: ScenarioCurrentUser,
    scenarioId: string,
    dto?: CalculateScenarioDto,
  ): Promise<{ scenario_id: string; status: 'PROCESSING' }> {
    const scenario = await this.ensureOwnedScenario(currentUser, scenarioId);
    if (scenario.status !== ScenarioStatus.DRAFT) {
      throw new BadRequestException({
        code: 'SCENARIO_NOT_EDITABLE',
        message: 'Le scénario doit être en brouillon (DRAFT) pour lancer le calcul.',
      });
    }

    await this.scenariosRepository.updateStatus(scenario.id, currentUser.org_id, ScenarioStatus.DRAFT);

    const calculationMode: ScenarioCalculationModeValue = dto?.calculation_mode ?? scenario.calculation_mode ?? 'GLOBAL';
    await this.scenariosRepository.updateCalculationMode(scenario.id, currentUser.org_id, calculationMode);

    const snapshot = await this.scenariosRepository.calculateSnapshotFromBudget({
      scenarioId: scenario.id,
      orgId: currentUser.org_id,
      budgetId: scenario.budget_id,
      calculationMode,
      hypotheses: scenario.hypotheses.map((h) => ({
        parameter: h.parameter,
        value: h.value.toString(),
        unit: h.unit,
      })),
    });

    await this.scenariosRepository.upsertScenarioSnapshot({
      scenarioId: scenario.id,
      orgId: currentUser.org_id,
      periodId: snapshot.period_id,
      is_revenue: snapshot.is_revenue,
      is_expenses: snapshot.is_expenses,
      is_ebitda: snapshot.is_ebitda,
      is_net: snapshot.is_net,
      bs_assets: snapshot.bs_assets,
      bs_liabilities: snapshot.bs_liabilities,
      bs_equity: snapshot.bs_equity,
      cf_operating: snapshot.cf_operating,
      cf_investing: snapshot.cf_investing,
      cf_financing: snapshot.cf_financing,
    });

    await this.scenariosRepository.updateStatus(scenario.id, currentUser.org_id, ScenarioStatus.CALCULATED);

    return { scenario_id: scenario.id, status: 'PROCESSING' };
  }

  async saveScenario(
    currentUser: ScenarioCurrentUser,
    scenarioId: string,
    ipAddress?: string,
  ): Promise<ScenarioResponseDto> {
    const scenario = await this.ensureOwnedScenario(currentUser, scenarioId);
    if (scenario.status !== ScenarioStatus.CALCULATED) {
      throw new BadRequestException({ code: 'SCENARIO_NOT_SAVEABLE' });
    }

    await this.scenariosRepository.updateStatus(scenario.id, currentUser.org_id, ScenarioStatus.SAVED);

    await this.auditService.createLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.SCENARIO_SAVE,
      entity_type: 'SCENARIO',
      entity_id: scenario.id,
      ip_address: ipAddress,
      metadata: { from_status: ScenarioStatus.CALCULATED, to_status: ScenarioStatus.SAVED },
    });

    const refreshed = await this.ensureOwnedScenario(currentUser, scenario.id);
    return this.toResponse(refreshed, currentUser.role);
  }

  async compareScenarios(
    currentUser: ScenarioCurrentUser,
    dto: CompareScenariosDto,
  ): Promise<{ scenarios: ScenarioResponseDto[]; snapshots_by_scenario: Record<string, unknown> }> {
    if (dto.scenario_ids.length > MAX_SCENARIO_COMPARE) {
      throw new BadRequestException({ code: SCENARIO_ERRORS.SCENARIO_MAX_COMPARE });
    }

    const scenarios = await this.scenariosRepository.findManySavedByIds(
      currentUser.org_id,
      dto.scenario_ids,
      currentUser.role,
    );

    if (scenarios.length !== dto.scenario_ids.length) {
      throw new NotFoundException();
    }

    const response = scenarios.map((scenario) => this.toResponse(scenario, currentUser.role));
    const snapshotsByScenario: Record<string, unknown> = {};
    for (const scenario of response) {
      snapshotsByScenario[scenario.id] = scenario.snapshot;
    }

    return { scenarios: response, snapshots_by_scenario: snapshotsByScenario };
  }

  async deleteScenario(currentUser: ScenarioCurrentUser, scenarioId: string): Promise<{ success: true }> {
    const scenario = await this.ensureOwnedScenario(currentUser, scenarioId);
    const referenced = await this.scenariosRepository.isReferencedInReport(scenario.id, currentUser.org_id);
    if (referenced) {
      throw new BadRequestException({ code: SCENARIO_ERRORS.SCENARIO_LOCKED });
    }

    await this.scenariosRepository.deleteScenario(scenario.id, currentUser.org_id);
    return { success: true };
  }

  private async ensureOwnedScenario(currentUser: ScenarioCurrentUser, scenarioId: string): Promise<RepoScenario> {
    const scenario = await this.scenariosRepository.findByIdInOrg(scenarioId, currentUser.org_id, currentUser.role);
    if (!scenario) {
      throw new NotFoundException();
    }
    return scenario;
  }

  private toResponse(scenario: RepoScenario, role: UserRole): ScenarioResponseDto {
    return {
      id: scenario.id,
      name: scenario.name,
      type: scenario.type,
      status: scenario.status,
      calculation_mode: scenario.calculation_mode,
      budget_id: scenario.budget_id,
      hypotheses:
        role === UserRole.LECTEUR
          ? null
          : scenario.hypotheses.map((hypothesis) => ({
              id: hypothesis.id,
              label: hypothesis.label,
              parameter: hypothesis.parameter,
              value: hypothesis.value.toString(),
              unit: hypothesis.unit,
            })),
      snapshot:
        scenario.snapshots[0]
          ? {
              id: scenario.snapshots[0].id,
              period_id: scenario.snapshots[0].period_id,
              is_revenue: scenario.snapshots[0].is_revenue.toString(),
              is_expenses: scenario.snapshots[0].is_expenses.toString(),
              is_ebitda: scenario.snapshots[0].is_ebitda.toString(),
              is_net: scenario.snapshots[0].is_net.toString(),
              bs_assets: scenario.snapshots[0].bs_assets.toString(),
              bs_liabilities: scenario.snapshots[0].bs_liabilities.toString(),
              bs_equity: scenario.snapshots[0].bs_equity.toString(),
              cf_operating: scenario.snapshots[0].cf_operating.toString(),
              cf_investing: scenario.snapshots[0].cf_investing.toString(),
              cf_financing: scenario.snapshots[0].cf_financing.toString(),
              calculated_at: scenario.snapshots[0].calculated_at,
            }
          : null,
      created_at: scenario.created_at,
    };
  }
}
