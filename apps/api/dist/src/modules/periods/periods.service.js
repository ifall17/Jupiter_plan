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
exports.PeriodsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const calc_engine_client_1 = require("../../common/services/calc-engine.client");
const syscohada_mapping_service_1 = require("../../common/services/syscohada-mapping.service");
const prisma_service_1 = require("../../prisma/prisma.service");
let PeriodsService = class PeriodsService {
    constructor(prisma, calcEngineClient, syscohadaMappingService) {
        this.prisma = prisma;
        this.calcEngineClient = calcEngineClient;
        this.syscohadaMappingService = syscohadaMappingService;
    }
    async findAll(orgId) {
        return this.prisma.period.findMany({
            where: { fiscal_year: { org_id: orgId } },
            orderBy: [
                { fiscal_year: { start_date: 'desc' } },
                { period_number: 'asc' },
            ],
            select: {
                id: true,
                label: true,
                period_number: true,
                fiscal_year_id: true,
                status: true,
                start_date: true,
                end_date: true,
                closed_at: true,
            },
        });
    }
    async findOne(id, orgId) {
        const period = await this.prisma.period.findFirst({
            where: { id, fiscal_year: { org_id: orgId } },
            select: {
                id: true,
                label: true,
                period_number: true,
                fiscal_year_id: true,
                status: true,
                start_date: true,
                end_date: true,
                closed_at: true,
                closed_by: true,
            },
        });
        if (!period) {
            throw new common_1.NotFoundException({ code: 'PERIOD_NOT_FOUND', message: 'Period not found' });
        }
        return period;
    }
    async closePeriod(periodId, currentUser) {
        const period = await this.prisma.period.findFirst({
            where: { id: periodId, fiscal_year: { org_id: currentUser.org_id } },
            select: {
                id: true,
                org_id: true,
                status: true,
                period_number: true,
                fiscal_year_id: true,
            },
        });
        if (!period) {
            throw new common_1.NotFoundException({ code: 'PERIOD_NOT_FOUND', message: 'Period not found' });
        }
        if (period.status === client_1.PeriodStatus.CLOSED) {
            throw new common_1.BadRequestException({ code: 'PERIOD_ALREADY_CLOSED', message: 'Period already closed' });
        }
        const pendingCount = await this.prisma.transaction.count({
            where: {
                org_id: currentUser.org_id,
                period_id: periodId,
                is_validated: false,
            },
        });
        if (pendingCount > 0) {
            throw new common_1.BadRequestException({
                code: 'PERIOD_HAS_PENDING_TX',
                message: 'Period has pending transactions',
                data: { pending_count: pendingCount },
            });
        }
        const validatedTransactions = await this.prisma.transaction.findMany({
            where: {
                org_id: currentUser.org_id,
                period_id: periodId,
                is_validated: true,
            },
            select: {
                account_code: true,
                amount: true,
            },
        });
        const accountMappings = await this.syscohadaMappingService.resolveFinancialMappings(currentUser.org_id, validatedTransactions.map((tx) => tx.account_code));
        const totals = validatedTransactions.reduce((acc, tx, index) => {
            const amountSigned = new client_1.Prisma.Decimal(tx.amount);
            const amountAbsolute = amountSigned.abs();
            const mapping = accountMappings[index];
            const accountCode = tx.account_code;
            if (mapping?.statement === 'INCOME_STATEMENT') {
                if (mapping.section === 'REVENUE') {
                    acc.revenue = acc.revenue.plus(amountAbsolute);
                }
                else if (mapping.section === 'EXPENSE') {
                    acc.expenses = acc.expenses.plus(amountAbsolute);
                    if (accountCode.startsWith('68')) {
                        acc.amortissements = acc.amortissements.plus(amountAbsolute);
                    }
                    if (accountCode.startsWith('69')) {
                        acc.taxes = acc.taxes.plus(amountAbsolute);
                    }
                }
                return acc;
            }
            if (mapping?.statement === 'BALANCE_SHEET') {
                if (mapping.presentation_rule === 'DYNAMIC_BY_BALANCE_SIGN') {
                    if (amountSigned.gte(0)) {
                        acc.assets = acc.assets.plus(amountAbsolute);
                    }
                    else {
                        acc.liabilities = acc.liabilities.plus(amountAbsolute);
                    }
                }
                else if (mapping.section === 'ASSET') {
                    acc.assets = acc.assets.plus(amountAbsolute);
                }
                else if (mapping.section === 'LIABILITY') {
                    acc.liabilities = acc.liabilities.plus(amountAbsolute);
                }
                if (mapping.line_type_hint === 'CAPEX') {
                    acc.capex = acc.capex.plus(amountAbsolute);
                }
            }
            return acc;
        }, {
            revenue: new client_1.Prisma.Decimal('0'),
            expenses: new client_1.Prisma.Decimal('0'),
            assets: new client_1.Prisma.Decimal('0'),
            liabilities: new client_1.Prisma.Decimal('0'),
            amortissements: new client_1.Prisma.Decimal('0'),
            taxes: new client_1.Prisma.Decimal('0'),
            capex: new client_1.Prisma.Decimal('0'),
        });
        const cfOperating = totals.revenue.minus(totals.expenses);
        const financialValues = {
            is_revenue: totals.revenue.toString(),
            is_expenses: totals.expenses.toString(),
            ca: totals.revenue.toString(),
            charges: totals.expenses.toString(),
            assets: totals.assets.toString(),
            liabilities: totals.liabilities.toString(),
            amortissements: totals.amortissements.toString(),
            taxes: totals.taxes.toString(),
            cf_operating: cfOperating.toString(),
            cf_investing: totals.capex.negated().toString(),
            cf_financing: '0',
        };
        const calcResponse = await this.calcEngineClient.post('/closing/close', {
            org_id: currentUser.org_id,
            period_id: periodId,
            financial_values: financialValues,
        });
        await this.prisma.$transaction(async (trx) => {
            const existingSnapshot = await trx.financialSnapshot.findFirst({
                where: {
                    org_id: currentUser.org_id,
                    period_id: periodId,
                    scenario_id: null,
                },
                select: { id: true },
            });
            if (existingSnapshot) {
                await trx.financialSnapshot.update({
                    where: { id: existingSnapshot.id },
                    data: {
                        is_revenue: calcResponse.snapshot.is_revenue,
                        is_expenses: calcResponse.snapshot.is_expenses,
                        is_ebitda: calcResponse.snapshot.is_ebitda,
                        is_net: calcResponse.snapshot.is_net,
                        bs_assets: calcResponse.snapshot.bs_assets,
                        bs_liabilities: calcResponse.snapshot.bs_liabilities,
                        bs_equity: calcResponse.snapshot.bs_equity,
                        cf_operating: calcResponse.snapshot.cf_operating,
                        cf_investing: calcResponse.snapshot.cf_investing,
                        cf_financing: calcResponse.snapshot.cf_financing,
                        calculated_at: new Date(),
                    },
                });
            }
            else {
                await trx.financialSnapshot.create({
                    data: {
                        org_id: currentUser.org_id,
                        period_id: periodId,
                        scenario_id: null,
                        is_revenue: calcResponse.snapshot.is_revenue,
                        is_expenses: calcResponse.snapshot.is_expenses,
                        is_ebitda: calcResponse.snapshot.is_ebitda,
                        is_net: calcResponse.snapshot.is_net,
                        bs_assets: calcResponse.snapshot.bs_assets,
                        bs_liabilities: calcResponse.snapshot.bs_liabilities,
                        bs_equity: calcResponse.snapshot.bs_equity,
                        cf_operating: calcResponse.snapshot.cf_operating,
                        cf_investing: calcResponse.snapshot.cf_investing,
                        cf_financing: calcResponse.snapshot.cf_financing,
                        calculated_at: new Date(),
                    },
                });
            }
            await trx.period.update({
                where: { id: periodId },
                data: {
                    status: client_1.PeriodStatus.CLOSED,
                    closed_at: new Date(),
                    closed_by: currentUser.sub,
                },
            });
            await trx.period.updateMany({
                where: {
                    org_id: currentUser.org_id,
                    fiscal_year_id: period.fiscal_year_id,
                    period_number: period.period_number + 1,
                    status: client_1.PeriodStatus.OPEN,
                },
                data: { status: client_1.PeriodStatus.OPEN },
            });
        });
        return {
            status: 'PROCESSING',
            job_id: (0, crypto_1.randomUUID)(),
            period_id: periodId,
        };
    }
};
exports.PeriodsService = PeriodsService;
exports.PeriodsService = PeriodsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        calc_engine_client_1.CalcEngineClient,
        syscohada_mapping_service_1.SyscohadaMappingService])
], PeriodsService);
//# sourceMappingURL=periods.service.js.map