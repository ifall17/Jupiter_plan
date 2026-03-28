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
const TARGETED_HYPOTHESIS_MAP = {
    revenue_growth: { lineTypes: [client_1.LineType.REVENUE] },
    export_growth: { lineTypes: [client_1.LineType.REVENUE], prefixes: ['7012', '7013', '7014'] },
    cost_reduction: { lineTypes: [client_1.LineType.EXPENSE], prefixes: ['601', '602', '604', '605'], inverse: true },
    payroll_increase: {
        lineTypes: [client_1.LineType.EXPENSE],
        prefixes: ['621', '622', '641', '642', '643', '644', '645', '646'],
    },
    defect_rate: { lineTypes: [client_1.LineType.EXPENSE], prefixes: ['601', '602', '604'] },
    capex_increase: { lineTypes: [client_1.LineType.CAPEX], prefixes: ['215', '218', '241', '244', '245', '246', '247', '248'] },
    marketing_increase: { lineTypes: [client_1.LineType.EXPENSE], prefixes: ['623', '624'] },
    overhead_reduction: { lineTypes: [client_1.LineType.EXPENSE], prefixes: ['625', '626', '627', '628'], inverse: true },
};
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
                calculation_mode: data.calculation_mode ?? 'GLOBAL',
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
        return budget?.status === client_1.BudgetStatus.APPROVED || budget?.status === client_1.BudgetStatus.LOCKED;
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
    async updateCalculationMode(scenarioId, orgId, calculationMode) {
        await this.prisma.scenario.updateMany({
            where: { id: scenarioId, org_id: orgId },
            data: { calculation_mode: calculationMode },
        });
    }
    async calculateSnapshotFromBudget(params) {
        const lines = await this.prisma.budgetLine.findMany({
            where: { budget_id: params.budgetId, org_id: params.orgId },
            select: { period_id: true, line_type: true, amount_budget: true, account_code: true },
            orderBy: { period_id: 'asc' },
        });
        if (lines.length === 0) {
            throw new Error('No budget lines found to calculate scenario');
        }
        const periodId = lines[0].period_id;
        const calculationMode = params.calculationMode ?? 'GLOBAL';
        let revenue = lines
            .filter((line) => line.line_type === client_1.LineType.REVENUE)
            .reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
        let expenses = lines
            .filter((line) => line.line_type === client_1.LineType.EXPENSE)
            .reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
        let capex = lines
            .filter((line) => line.line_type === client_1.LineType.CAPEX)
            .reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
        let receivablesDelta = new client_1.Prisma.Decimal('0');
        let payablesDelta = new client_1.Prisma.Decimal('0');
        const hundred = new client_1.Prisma.Decimal('100');
        const thirty = new client_1.Prisma.Decimal('30');
        const zero = new client_1.Prisma.Decimal('0');
        const baseRevenue = revenue;
        const baseExpenses = expenses;
        const baseCapex = capex;
        let revenuePctChange = new client_1.Prisma.Decimal('0');
        let revenueDelta = new client_1.Prisma.Decimal('0');
        let expensePctChange = new client_1.Prisma.Decimal('0');
        let expenseDelta = new client_1.Prisma.Decimal('0');
        let capexDelta = new client_1.Prisma.Decimal('0');
        const dsoDpoBatch = [];
        if (calculationMode === 'GLOBAL') {
            for (const hypothesis of params.hypotheses) {
                const param = hypothesis.parameter.trim().toLowerCase();
                let value;
                try {
                    value = new client_1.Prisma.Decimal(hypothesis.value);
                }
                catch {
                    continue;
                }
                if (param === 'revenue_growth' || param === 'export_growth') {
                    if (hypothesis.unit === '%') {
                        revenuePctChange = revenuePctChange.plus(value);
                    }
                    else if (hypothesis.unit === 'FCFA') {
                        revenueDelta = revenueDelta.plus(value);
                    }
                    else if (hypothesis.unit === 'multiplier') {
                        revenuePctChange = revenuePctChange.plus(value.minus(new client_1.Prisma.Decimal('1')).mul(hundred));
                    }
                }
                else if (param === 'cost_reduction') {
                    if (hypothesis.unit === '%') {
                        expensePctChange = expensePctChange.minus(value);
                    }
                    else if (hypothesis.unit === 'FCFA') {
                        expenseDelta = expenseDelta.minus(value);
                    }
                    else if (hypothesis.unit === 'multiplier') {
                        expensePctChange = expensePctChange.minus(new client_1.Prisma.Decimal('1').minus(value).mul(hundred));
                    }
                }
                else if (param === 'payroll_increase' || param === 'defect_rate') {
                    if (hypothesis.unit === '%') {
                        expensePctChange = expensePctChange.plus(value);
                    }
                    else if (hypothesis.unit === 'FCFA') {
                        expenseDelta = expenseDelta.plus(value);
                    }
                }
                else if (param === 'capex_increase') {
                    if (hypothesis.unit === '%') {
                        capexDelta = capexDelta.plus(baseCapex.mul(value).div(hundred));
                    }
                    else if (hypothesis.unit === 'FCFA') {
                        capexDelta = capexDelta.plus(value);
                    }
                }
                else if (param === 'dso_change' || param === 'dpo_change') {
                    dsoDpoBatch.push({ param, value, unit: hypothesis.unit });
                }
            }
            revenue = baseRevenue
                .mul(new client_1.Prisma.Decimal('1').plus(revenuePctChange.div(hundred)))
                .plus(revenueDelta);
            const netExpenseFactor = new client_1.Prisma.Decimal('1').plus(expensePctChange.div(hundred));
            expenses = baseExpenses
                .mul(netExpenseFactor.lt(zero) ? zero : netExpenseFactor)
                .plus(expenseDelta);
            if (expenses.lt(zero))
                expenses = zero;
            capex = baseCapex.plus(capexDelta);
        }
        else {
            const adjustedLines = lines.map((line) => ({
                ...line,
                amount_budget: new client_1.Prisma.Decimal(line.amount_budget),
            }));
            const lineMatchesTarget = (line, target) => {
                if (target.lineTypes?.length && !target.lineTypes.includes(line.line_type)) {
                    return false;
                }
                if (target.prefixes?.length) {
                    return target.prefixes.some((prefix) => line.account_code.startsWith(prefix));
                }
                return true;
            };
            for (const hypothesis of params.hypotheses) {
                const param = hypothesis.parameter.trim().toLowerCase();
                let value;
                try {
                    value = new client_1.Prisma.Decimal(hypothesis.value);
                }
                catch {
                    continue;
                }
                if (param === 'dso_change' || param === 'dpo_change') {
                    dsoDpoBatch.push({ param, value, unit: hypothesis.unit });
                    continue;
                }
                const target = TARGETED_HYPOTHESIS_MAP[param];
                if (!target) {
                    continue;
                }
                for (const line of adjustedLines) {
                    if (!lineMatchesTarget(line, target)) {
                        continue;
                    }
                    const current = line.amount_budget;
                    let next = current;
                    if (hypothesis.unit === '%') {
                        const factor = value.div(hundred);
                        next = target.inverse
                            ? current.mul(new client_1.Prisma.Decimal('1').minus(factor))
                            : current.mul(new client_1.Prisma.Decimal('1').plus(factor));
                    }
                    else if (hypothesis.unit === 'FCFA') {
                        next = target.inverse ? current.minus(value) : current.plus(value);
                    }
                    else if (hypothesis.unit === 'multiplier') {
                        next = current.mul(value);
                    }
                    line.amount_budget = next.lt(zero) ? zero : next;
                }
            }
            revenue = adjustedLines
                .filter((line) => line.line_type === client_1.LineType.REVENUE)
                .reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
            expenses = adjustedLines
                .filter((line) => line.line_type === client_1.LineType.EXPENSE)
                .reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
            capex = adjustedLines
                .filter((line) => line.line_type === client_1.LineType.CAPEX)
                .reduce((sum, line) => sum.plus(line.amount_budget), new client_1.Prisma.Decimal('0'));
        }
        for (const h of dsoDpoBatch) {
            if (h.param === 'dso_change' && h.unit === 'jours') {
                receivablesDelta = receivablesDelta.plus(revenue.div(thirty).mul(h.value));
            }
            if (h.param === 'dpo_change' && h.unit === 'jours') {
                payablesDelta = payablesDelta.plus(expenses.div(thirty).mul(h.value));
            }
        }
        const ebitda = revenue.minus(expenses);
        const IS_RATE = new client_1.Prisma.Decimal('0.20');
        const isTax = ebitda.gt(zero) ? ebitda.mul(IS_RATE) : zero;
        const net = ebitda.minus(isTax);
        const toMoney = (d) => d.toDecimalPlaces(2, client_1.Prisma.Decimal.ROUND_HALF_UP);
        const totalExpenses = expenses.plus(capex);
        const assets = revenue.mul(new client_1.Prisma.Decimal('0.6')).plus(receivablesDelta);
        const liabilities = totalExpenses.mul(new client_1.Prisma.Decimal('0.45')).plus(payablesDelta);
        const cfOperating = ebitda.minus(receivablesDelta).plus(payablesDelta);
        return {
            period_id: periodId,
            is_revenue: toMoney(revenue),
            is_expenses: toMoney(totalExpenses),
            is_ebitda: toMoney(ebitda),
            is_net: toMoney(net),
            bs_assets: toMoney(assets),
            bs_liabilities: toMoney(liabilities),
            bs_equity: toMoney(assets.minus(liabilities)),
            cf_operating: toMoney(cfOperating),
            cf_investing: toMoney(capex.negated()),
            cf_financing: toMoney(zero),
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