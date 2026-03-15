"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScenariosService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const business_constants_1 = require("../../common/constants/business.constants");
const audit_service_1 = require("../../common/services/audit.service");
const scenarios_repository_1 = require("./scenarios.repository");
const SCENARIO_ERRORS = {
    SCENARIO_BASE_REQUIRED: 'SCENARIO_BASE_REQUIRED',
    SCENARIO_MAX_COMPARE: 'SCENARIO_MAX_COMPARE',
    SCENARIO_LOCKED: 'SCENARIO_LOCKED',
};
let ScenariosService = class ScenariosService {
    constructor(scenariosRepository, auditService, calcQueue) {
        this.scenariosRepository = scenariosRepository;
        this.auditService = auditService;
        this.calcQueue = calcQueue;
    }
    async listScenarios(params) {
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
    async getScenarioById(currentUser, scenarioId) {
        const scenario = await this.scenariosRepository.findByIdInOrg(scenarioId, currentUser.org_id, currentUser.role);
        if (!scenario) {
            throw new common_1.NotFoundException();
        }
        return this.toResponse(scenario, currentUser.role);
    }
    async createScenario(currentUser, dto) {
        const approved = await this.scenariosRepository.isBudgetApproved(dto.budget_id, currentUser.org_id);
        if (!approved) {
            throw new common_1.BadRequestException({ code: SCENARIO_ERRORS.SCENARIO_BASE_REQUIRED });
        }
        const created = await this.scenariosRepository.createScenario({
            org_id: currentUser.org_id,
            budget_id: dto.budget_id,
            name: dto.name.trim(),
            type: dto.type,
            created_by: currentUser.sub,
        });
        return this.toResponse(created, currentUser.role);
    }
    async addHypotheses(currentUser, scenarioId, dto) {
        const scenario = await this.ensureOwnedScenario(currentUser, scenarioId);
        if (scenario.status !== client_1.ScenarioStatus.DRAFT) {
            throw new common_1.BadRequestException({ code: 'SCENARIO_NOT_EDITABLE' });
        }
        await this.scenariosRepository.replaceHypotheses(scenario.id, currentUser.org_id, dto.hypotheses.map((hypothesis) => ({
            label: hypothesis.label.trim(),
            parameter: hypothesis.parameter.trim(),
            value: hypothesis.value,
            unit: hypothesis.unit,
        })));
        const refreshed = await this.ensureOwnedScenario(currentUser, scenario.id);
        return this.toResponse(refreshed, currentUser.role);
    }
    async calculateScenario(currentUser, scenarioId) {
        const scenario = await this.ensureOwnedScenario(currentUser, scenarioId);
        if (scenario.status !== client_1.ScenarioStatus.DRAFT) {
            throw new common_1.BadRequestException({ code: 'SCENARIO_NOT_EDITABLE' });
        }
        await this.calcQueue.add('scenario-calculate', {
            scenario_id: scenario.id,
            org_id: currentUser.org_id,
            budget_id: scenario.budget_id,
            hypotheses: scenario.hypotheses.map((h) => ({
                parameter: h.parameter,
                value: h.value.toString(),
                unit: h.unit,
            })),
        }, { removeOnComplete: 100, removeOnFail: 100 });
        return { scenario_id: scenario.id, status: 'PROCESSING' };
    }
    async saveScenario(currentUser, scenarioId, ipAddress) {
        const scenario = await this.ensureOwnedScenario(currentUser, scenarioId);
        if (scenario.status !== client_1.ScenarioStatus.CALCULATED) {
            throw new common_1.BadRequestException({ code: 'SCENARIO_NOT_SAVEABLE' });
        }
        await this.scenariosRepository.updateStatus(scenario.id, currentUser.org_id, client_1.ScenarioStatus.SAVED);
        await this.auditService.createLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.SCENARIO_SAVE,
            entity_type: 'SCENARIO',
            entity_id: scenario.id,
            ip_address: ipAddress,
            metadata: { from_status: client_1.ScenarioStatus.CALCULATED, to_status: client_1.ScenarioStatus.SAVED },
        });
        const refreshed = await this.ensureOwnedScenario(currentUser, scenario.id);
        return this.toResponse(refreshed, currentUser.role);
    }
    async compareScenarios(currentUser, dto) {
        if (dto.scenario_ids.length > business_constants_1.MAX_SCENARIO_COMPARE) {
            throw new common_1.BadRequestException({ code: SCENARIO_ERRORS.SCENARIO_MAX_COMPARE });
        }
        const scenarios = await this.scenariosRepository.findManySavedByIds(currentUser.org_id, dto.scenario_ids, currentUser.role);
        if (scenarios.length !== dto.scenario_ids.length) {
            throw new common_1.NotFoundException();
        }
        const response = scenarios.map((scenario) => this.toResponse(scenario, currentUser.role));
        const snapshotsByScenario = {};
        for (const scenario of response) {
            snapshotsByScenario[scenario.id] = scenario.snapshot;
        }
        return { scenarios: response, snapshots_by_scenario: snapshotsByScenario };
    }
    async deleteScenario(currentUser, scenarioId) {
        const scenario = await this.ensureOwnedScenario(currentUser, scenarioId);
        const referenced = await this.scenariosRepository.isReferencedInReport(scenario.id, currentUser.org_id);
        if (referenced) {
            throw new common_1.BadRequestException({ code: SCENARIO_ERRORS.SCENARIO_LOCKED });
        }
        await this.scenariosRepository.deleteScenario(scenario.id, currentUser.org_id);
        return { success: true };
    }
    async ensureOwnedScenario(currentUser, scenarioId) {
        const scenario = await this.scenariosRepository.findByIdInOrg(scenarioId, currentUser.org_id, currentUser.role);
        if (!scenario) {
            throw new common_1.NotFoundException();
        }
        return scenario;
    }
    toResponse(scenario, role) {
        return {
            id: scenario.id,
            name: scenario.name,
            type: scenario.type,
            status: scenario.status,
            budget_id: scenario.budget_id,
            hypotheses: role === enums_1.UserRole.LECTEUR
                ? null
                : scenario.hypotheses.map((hypothesis) => ({
                    id: hypothesis.id,
                    label: hypothesis.label,
                    parameter: hypothesis.parameter,
                    value: hypothesis.value.toString(),
                    unit: hypothesis.unit,
                })),
            snapshot: scenario.snapshots[0]
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
};
exports.ScenariosService = ScenariosService;
exports.ScenariosService = ScenariosService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bullmq_1.InjectQueue)('calc-queue')),
    __metadata("design:paramtypes", [scenarios_repository_1.ScenariosRepository,
        audit_service_1.AuditService,
        bullmq_2.Queue])
], ScenariosService);
//# sourceMappingURL=scenarios.service.js.map