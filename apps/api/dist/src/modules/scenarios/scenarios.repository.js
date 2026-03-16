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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScenariosRepository = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const prisma_service_1 = require("../../prisma/prisma.service");
let ScenariosRepository = class ScenariosRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findPaginated(params) {
        const where = { org_id: params.org_id };
        if (params.role === enums_1.UserRole.LECTEUR) {
            where.status = client_1.ScenarioStatus.SAVED;
        }
        else if (params.status) {
            where.status = params.status;
        }
        if (params.fiscal_year_id) {
            where.budget = { fiscal_year_id: params.fiscal_year_id };
        }
        const [items, total] = await this.prisma.$transaction([
            this.prisma.scenario.findMany({
                where,
                skip: params.skip,
                take: params.take,
                orderBy: { created_at: 'desc' },
                include: {
                    hypotheses: true,
                    snapshots: {
                        orderBy: { calculated_at: 'desc' },
                        take: 1,
                    },
                },
            }),
            this.prisma.scenario.count({ where }),
        ]);
        return { items, total };
    }
    async findByIdInOrg(id, orgId, role) {
        return this.prisma.scenario.findFirst({
            where: {
                id,
                org_id: orgId,
                ...(role === enums_1.UserRole.LECTEUR ? { status: client_1.ScenarioStatus.SAVED } : {}),
            },
            include: {
                hypotheses: true,
                snapshots: {
                    orderBy: { calculated_at: 'desc' },
                    take: 1,
                },
            },
        });
    }
    async createScenario(data) {
        return this.prisma.scenario.create({
            data: {
                org_id: data.org_id,
                budget_id: data.budget_id,
                name: data.name,
                type: data.type,
                status: client_1.ScenarioStatus.DRAFT,
                created_by: data.created_by,
            },
            include: {
                hypotheses: true,
                snapshots: {
                    orderBy: { calculated_at: 'desc' },
                    take: 1,
                },
            },
        });
    }
    async isBudgetApproved(budgetId, orgId) {
        const budget = await this.prisma.budget.findFirst({
            where: { id: budgetId, org_id: orgId },
            select: { status: true },
        });
        return budget?.status === client_1.BudgetStatus.APPROVED;
    }
    async replaceHypotheses(scenarioId, orgId, hypotheses) {
        await this.prisma.$transaction(async (tx) => {
            await tx.scenarioHypothesis.deleteMany({ where: { scenario_id: scenarioId } });
            if (hypotheses.length === 0) {
                return;
            }
            await tx.scenarioHypothesis.createMany({
                data: hypotheses.map((hypothesis) => ({
                    scenario_id: scenarioId,
                    label: hypothesis.label,
                    parameter: hypothesis.parameter,
                    value: new client_1.Prisma.Decimal(hypothesis.value),
                    unit: hypothesis.unit,
                })),
            });
        });
    }
    async updateStatus(scenarioId, orgId, status) {
        await this.prisma.scenario.updateMany({
            where: { id: scenarioId, org_id: orgId },
            data: {
                status,
                ...(status === client_1.ScenarioStatus.CALCULATED ? { calculated_at: new Date() } : {}),
                ...(status === client_1.ScenarioStatus.SAVED ? { saved_at: new Date() } : {}),
            },
        });
    }
    async calculateSnapshotFromBudget(params) {
        const lines = await this.prisma.budgetLine.findMany({
            where: { budget_id: params.budgetId, org_id: params.orgId },
            select: { period_id: true, line_type: true, amount_budget: true },
            orderBy: { period_id: 'asc' },
        });
        if (lines.length === 0) {
            throw new Error('No budget lines found to calculate scenario');
        }
        const periodId = lines[0].period_id;
        let revenue = lines
            .filter((line) => line.line_type === client_1.LineType.REVENUE)
            .reduce((sum, line) => sum + Number(line.amount_budget), 0);
        let expenses = lines
            .filter((line) => line.line_type === client_1.LineType.EXPENSE)
            .reduce((sum, line) => sum + Number(line.amount_budget), 0);
        let capex = lines
            .filter((line) => line.line_type === client_1.LineType.CAPEX)
            .reduce((sum, line) => sum + Number(line.amount_budget), 0);
        for (const hypothesis of params.hypotheses) {
            const param = hypothesis.parameter.trim().toLowerCase();
            const value = Number.parseFloat(hypothesis.value);
            if (!Number.isFinite(value)) {
                continue;
            }
            if (param === 'revenue_growth') {
                if (hypothesis.unit === '%') {
                    revenue *= 1 + value / 100;
                }
                else if (hypothesis.unit === 'FCFA') {
                    revenue += value;
                }
                else if (hypothesis.unit === 'multiplier') {
                    revenue *= value;
                }
            }
            if (param === 'cost_reduction') {
                if (hypothesis.unit === '%') {
                    expenses *= 1 - value / 100;
                }
                else if (hypothesis.unit === 'FCFA') {
                    expenses = Math.max(0, expenses - value);
                }
                else if (hypothesis.unit === 'multiplier') {
                    expenses *= value;
                }
            }
            if (param === 'capex_increase') {
                if (hypothesis.unit === '%') {
                    capex *= 1 + value / 100;
                }
                else if (hypothesis.unit === 'FCFA') {
                    capex += value;
                }
                else if (hypothesis.unit === 'multiplier') {
                    capex *= value;
                }
            }
        }
        const ebitda = revenue - expenses;
        const net = ebitda - capex;
        const toDecimal = (n) => new client_1.Prisma.Decimal(n.toFixed(2));
        return {
            period_id: periodId,
            is_revenue: toDecimal(revenue),
            is_expenses: toDecimal(expenses + capex),
            is_ebitda: toDecimal(ebitda),
            is_net: toDecimal(net),
            bs_assets: toDecimal(revenue * 0.6),
            bs_liabilities: toDecimal((expenses + capex) * 0.45),
            bs_equity: toDecimal(revenue * 0.6 - (expenses + capex) * 0.45),
            cf_operating: toDecimal(ebitda),
            cf_investing: toDecimal(-capex),
            cf_financing: toDecimal(0),
        };
    }
    async upsertScenarioSnapshot(params) {
        await this.prisma.financialSnapshot.upsert({
            where: {
                org_id_period_id_scenario_id: {
                    org_id: params.orgId,
                    period_id: params.periodId,
                    scenario_id: params.scenarioId,
                },
            },
            create: {
                org_id: params.orgId,
                period_id: params.periodId,
                scenario_id: params.scenarioId,
                is_revenue: params.is_revenue,
                is_expenses: params.is_expenses,
                is_ebitda: params.is_ebitda,
                is_net: params.is_net,
                bs_assets: params.bs_assets,
                bs_liabilities: params.bs_liabilities,
                bs_equity: params.bs_equity,
                cf_operating: params.cf_operating,
                cf_investing: params.cf_investing,
                cf_financing: params.cf_financing,
                calculated_at: new Date(),
            },
            update: {
                is_revenue: params.is_revenue,
                is_expenses: params.is_expenses,
                is_ebitda: params.is_ebitda,
                is_net: params.is_net,
                bs_assets: params.bs_assets,
                bs_liabilities: params.bs_liabilities,
                bs_equity: params.bs_equity,
                cf_operating: params.cf_operating,
                cf_investing: params.cf_investing,
                cf_financing: params.cf_financing,
                calculated_at: new Date(),
            },
        });
    }
    async findManySavedByIds(orgId, ids, role) {
        return this.prisma.scenario.findMany({
            where: {
                org_id: orgId,
                id: { in: ids },
                status: client_1.ScenarioStatus.SAVED,
            },
            include: {
                hypotheses: role === enums_1.UserRole.LECTEUR ? false : true,
                snapshots: {
                    orderBy: { calculated_at: 'desc' },
                    take: 1,
                },
            },
        });
    }
    async isReferencedInReport(scenarioId, orgId) {
        const count = await this.prisma.auditLog.count({
            where: {
                org_id: orgId,
                action: 'EXPORT',
                entity_type: 'REPORT',
                entity_id: scenarioId,
            },
        });
        return count > 0;
    }
    async deleteScenario(scenarioId, orgId) {
        await this.prisma.scenario.deleteMany({
            where: { id: scenarioId, org_id: orgId },
        });
    }
};
exports.ScenariosRepository = ScenariosRepository;
exports.ScenariosRepository = ScenariosRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ScenariosRepository);
//# sourceMappingURL=scenarios.repository.js.map