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
            .reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
        let expenses = lines
            .filter((line) => line.line_type === client_1.LineType.EXPENSE)
            .reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
        let capex = lines
            .filter((line) => line.line_type === client_1.LineType.CAPEX)
            .reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
        for (const hypothesis of params.hypotheses) {
            const param = hypothesis.parameter.trim().toLowerCase();
            let value;
            try {
                value = new client_1.Prisma.Decimal(hypothesis.value);
            }
            catch {
                continue;
            }
            if (param === 'revenue_growth') {
                if (hypothesis.unit === '%') {
                    revenue = revenue.mul(new client_1.Prisma.Decimal('1').plus(value.div(new client_1.Prisma.Decimal('100'))));
                }
                else if (hypothesis.unit === 'FCFA') {
                    revenue = revenue.plus(value);
                }
                else if (hypothesis.unit === 'multiplier') {
                    revenue = revenue.mul(value);
                }
            }
            if (param === 'cost_reduction') {
                if (hypothesis.unit === '%') {
                    expenses = expenses.mul(new client_1.Prisma.Decimal('1').minus(value.div(new client_1.Prisma.Decimal('100'))));
                }
                else if (hypothesis.unit === 'FCFA') {
                    const reduced = expenses.minus(value);
                    expenses = reduced.lt(new client_1.Prisma.Decimal('0')) ? new client_1.Prisma.Decimal('0') : reduced;
                }
                else if (hypothesis.unit === 'multiplier') {
                    expenses = expenses.mul(value);
                }
            }
            if (param === 'capex_increase') {
                if (hypothesis.unit === '%') {
                    capex = capex.mul(new client_1.Prisma.Decimal('1').plus(value.div(new client_1.Prisma.Decimal('100'))));
                }
                else if (hypothesis.unit === 'FCFA') {
                    capex = capex.plus(value);
                }
                else if (hypothesis.unit === 'multiplier') {
                    capex = capex.mul(value);
                }
            }
        }
        const ebitda = revenue.minus(expenses);
        const net = ebitda.minus(capex);
        const toMoney = (d) => d.toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP);
        const totalExpenses = expenses.plus(capex);
        const assets = revenue.mul(new client_1.Prisma.Decimal('0.6'));
        const liabilities = totalExpenses.mul(new client_1.Prisma.Decimal('0.45'));
        return {
            period_id: periodId,
            is_revenue: toMoney(revenue),
            is_expenses: toMoney(totalExpenses),
            is_ebitda: toMoney(ebitda),
            is_net: toMoney(net),
            bs_assets: toMoney(assets),
            bs_liabilities: toMoney(liabilities),
            bs_equity: toMoney(assets.minus(liabilities)),
            cf_operating: toMoney(ebitda),
            cf_investing: toMoney(capex.negated()),
            cf_financing: new client_1.Prisma.Decimal('0'),
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