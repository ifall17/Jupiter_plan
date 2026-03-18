import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CashFlowDirection, CashFlowType, Prisma } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { CashFlowRepository, RepoCashFlowPlan } from './cash-flow.repository';
import { CashFlowResponseDto } from './dto/cash-flow-response.dto';
import { CreateCashFlowPlanDto } from './dto/create-cash-flow-plan.dto';
import { CreateCashFlowEntryDto } from './dto/create-cash-flow-entry.dto';

export interface CashFlowCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class CashFlowService {
  constructor(private readonly cashFlowRepository: CashFlowRepository) {}

  async getRollingPlan(params: {
    org_id: string;
    period_id?: string;
    ytd?: boolean;
    quarter?: number;
    from_period?: string;
    to_period?: string;
  }): Promise<{
    weekly: Array<{ week: number; inflows: string; outflows: string }>;
    total_inflows: string;
    total_outflows: string;
    runway_weeks: number;
    entries_count: number;
  }> {
    const periodIds = await this.resolvePeriodIds(params.org_id, {
      period_id: params.period_id,
      ytd: params.ytd,
      quarter: params.quarter,
      from_period: params.from_period,
      to_period: params.to_period,
    });

    const plans = await this.cashFlowRepository.findRollingPlans({
      org_id: params.org_id,
      period_ids: periodIds.length > 0 ? periodIds : undefined,
    });
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const zero = new Prisma.Decimal('0');

    const weeklyDecimal = Array.from({ length: 13 }, (_, i) => ({
      week: i + 1,
      inflows: zero,
      outflows: zero,
    }));

    plans.forEach((plan) => {
      const weekIndex = (() => {
        if (plan.planned_date) {
          const planned = new Date(plan.planned_date);
          planned.setHours(0, 0, 0, 0);
          const diffWeeks = Math.floor((planned.getTime() - now.getTime()) / weekMs);
          if (diffWeeks < 0 || diffWeeks > 12) {
            return -1;
          }
          return diffWeeks;
        }

        const fallback = plan.week_number - 1;
        if (fallback < 0 || fallback > 12) {
          return -1;
        }
        return fallback;
      })();

      if (weekIndex < 0 || weekIndex > 12) {
        return;
      }

      const strictAmount = plan.amount;
      const strictInflows = plan.direction === CashFlowDirection.IN ? strictAmount : zero;
      const strictOutflows = plan.direction === CashFlowDirection.OUT ? strictAmount : zero;
      const normalizedInflows = strictAmount.gt(zero) ? strictInflows : plan.inflow;
      const normalizedOutflows = strictAmount.gt(zero) ? strictOutflows : plan.outflow;

      weeklyDecimal[weekIndex] = {
        week: weeklyDecimal[weekIndex].week,
        inflows: weeklyDecimal[weekIndex].inflows.plus(normalizedInflows),
        outflows: weeklyDecimal[weekIndex].outflows.plus(normalizedOutflows),
      };
    });

    const totalInflows = weeklyDecimal.reduce((sum, item) => sum.plus(item.inflows), zero);
    const totalOutflows = weeklyDecimal.reduce((sum, item) => sum.plus(item.outflows), zero);

    const avgOutflow = totalOutflows.gt(zero)
      ? totalOutflows.div(new Prisma.Decimal('13'))
      : zero;
    const runway = avgOutflow.gt(zero)
      ? totalInflows.div(avgOutflow).toDecimalPlaces(0, Prisma.Decimal.ROUND_FLOOR).toNumber()
      : 0;

    const weekly = weeklyDecimal.map((item) => ({
      week: item.week,
      inflows: item.inflows.toString(),
      outflows: item.outflows.toString(),
    }));

    return {
      weekly,
      total_inflows: totalInflows.toString(),
      total_outflows: totalOutflows.toString(),
      runway_weeks: runway,
      entries_count: plans.length,
    };
  }

  async createPlannedEntry(currentUser: CashFlowCurrentUser, dto: CreateCashFlowEntryDto): Promise<CashFlowResponseDto> {
    const plannedDate = new Date(dto.planned_date);
    if (Number.isNaN(plannedDate.getTime())) {
      throw new NotFoundException('Invalid planned_date');
    }

    const period = await this.cashFlowRepository.findPeriodByDate(currentUser.org_id, plannedDate);
    if (!period) {
      throw new NotFoundException('Aucune période trouvée pour cette date');
    }

    const diffMs = plannedDate.getTime() - period.start_date.getTime();
    const weekNumber = Math.min(13, Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1));

    if (dto.bank_account_id) {
      const bankAccount = await this.cashFlowRepository.findBankAccountById(currentUser.org_id, dto.bank_account_id);
      if (!bankAccount) {
        throw new BadRequestException('Compte bancaire invalide pour cette organisation');
      }
    }

    const amount = new Prisma.Decimal(dto.amount);
    const inflow = dto.direction === 'IN' ? amount : new Prisma.Decimal('0');
    const outflow = dto.direction === 'OUT' ? amount : new Prisma.Decimal('0');
    const balance = inflow.minus(outflow);

    const weeklyBurn = outflow.gt(new Prisma.Decimal('0')) ? outflow : new Prisma.Decimal('0');
    const cashBalance = await this.cashFlowRepository.totalActiveCash(currentUser.org_id);
    const runwayWeeks = this.calculateRunwayWeeks(cashBalance, weeklyBurn);

    const plan = await this.cashFlowRepository.create({
      org_id: currentUser.org_id,
      period_id: period.id,
      week_number: weekNumber,
      planned_date: plannedDate,
      flow_type: dto.flow_type,
      direction: dto.direction,
      amount,
      bank_account_id: dto.bank_account_id ?? null,
      notes: dto.notes?.trim() ?? null,
      label: dto.label.trim(),
      inflow,
      outflow,
      balance,
      runway_weeks: runwayWeeks,
    });

    return this.toResponse(plan);
  }

  async listRollingPlan(params: {
    currentUser: CashFlowCurrentUser;
    fiscal_year_id?: string;
    period_id?: string;
  }): Promise<CashFlowResponseDto[]> {
    const plans = await this.cashFlowRepository.findRollingPlans({
      org_id: params.currentUser.org_id,
      fiscal_year_id: params.fiscal_year_id,
      period_id: params.period_id,
    });

    return plans.map((plan) => this.toResponse(plan));
  }

  async listPlans(
    currentUser: CashFlowCurrentUser,
    params?: { period_id?: string; ytd?: boolean; quarter?: number; from_period?: string; to_period?: string },
  ): Promise<CashFlowResponseDto[]> {
    const periodIds = await this.resolvePeriodIds(currentUser.org_id, {
      period_id: params?.period_id,
      ytd: params?.ytd,
      quarter: params?.quarter,
      from_period: params?.from_period,
      to_period: params?.to_period,
    });
    const plans = await this.cashFlowRepository.findRollingPlans({
      org_id: currentUser.org_id,
      period_ids: periodIds.length > 0 ? periodIds : undefined,
    });
    return plans.map((plan) => this.toResponse(plan));
  }

  async deletePlan(id: string, orgId: string): Promise<{ success: true }> {
    const plan = await this.cashFlowRepository.findByIdInOrg(id, orgId);
    if (!plan) {
      throw new NotFoundException('Flux introuvable');
    }

    await this.cashFlowRepository.deletePlan(id, orgId);
    return { success: true };
  }

  async createOrUpdatePlan(
    currentUser: CashFlowCurrentUser,
    dto: CreateCashFlowPlanDto,
  ): Promise<CashFlowResponseDto> {
    const inflow = new Prisma.Decimal(dto.inflow);
    const outflow = new Prisma.Decimal(dto.outflow);
    const balance = inflow.minus(outflow);
    const cashBalance = await this.cashFlowRepository.totalActiveCash(currentUser.org_id);
    const runwayWeeks = this.calculateRunwayWeeks(cashBalance, outflow);

    const existing = await this.cashFlowRepository.findByPeriodAndWeek(
      currentUser.org_id,
      dto.period_id,
      dto.week_number,
    );

    const period = await this.cashFlowRepository.findPeriodById(dto.period_id, currentUser.org_id);
    if (!period) {
      throw new NotFoundException();
    }

    const plannedDate = new Date(period.start_date.getTime() + (dto.week_number - 1) * 7 * 24 * 60 * 60 * 1000);

    const plan = existing
      ? await this.cashFlowRepository.update(existing.id, currentUser.org_id, {
          label: dto.label.trim(),
          planned_date: plannedDate,
          flow_type: CashFlowType.LEGACY,
          direction: inflow.gt(new Prisma.Decimal('0')) ? CashFlowDirection.IN : CashFlowDirection.OUT,
          amount: inflow.gt(new Prisma.Decimal('0')) ? inflow : outflow,
          notes: null,
          bank_account_id: null,
          inflow,
          outflow,
          balance,
          runway_weeks: runwayWeeks,
        })
      : await this.cashFlowRepository.create({
          org_id: currentUser.org_id,
          period_id: dto.period_id,
          week_number: dto.week_number,
          planned_date: plannedDate,
          flow_type: CashFlowType.LEGACY,
          direction: inflow.gt(new Prisma.Decimal('0')) ? CashFlowDirection.IN : CashFlowDirection.OUT,
          amount: inflow.gt(new Prisma.Decimal('0')) ? inflow : outflow,
          notes: null,
          bank_account_id: null,
          label: dto.label.trim(),
          inflow,
          outflow,
          balance,
          runway_weeks: runwayWeeks,
        });

    return this.toResponse(plan);
  }

  async getRunwayStatus(currentUser: CashFlowCurrentUser): Promise<{
    runway_weeks: number;
    severity: 'INFO' | 'WARN' | 'CRITICAL';
    threshold_warn: number;
    threshold_critical: number;
  }> {
    const plans = await this.cashFlowRepository.findRollingPlans({ org_id: currentUser.org_id });
    const weeklyBurn = plans.reduce(
      (sum, plan) => sum.plus(plan.outflow),
      new Prisma.Decimal('0'),
    );
    const averageWeeklyBurn = plans.length > 0
      ? weeklyBurn.div(new Prisma.Decimal(plans.length.toString()))
      : new Prisma.Decimal('0');

    const cashBalance = await this.cashFlowRepository.totalActiveCash(currentUser.org_id);
    const runway = this.calculateRunwayWeeks(cashBalance, averageWeeklyBurn) ?? 0;

    if (runway < 4) {
      return { runway_weeks: runway, severity: 'CRITICAL', threshold_warn: 8, threshold_critical: 4 };
    }

    if (runway < 8) {
      return { runway_weeks: runway, severity: 'WARN', threshold_warn: 8, threshold_critical: 4 };
    }

    return { runway_weeks: runway, severity: 'INFO', threshold_warn: 8, threshold_critical: 4 };
  }

  private async resolvePeriodIds(
    orgId: string,
    params: { period_id?: string; ytd?: boolean; quarter?: number; from_period?: string; to_period?: string },
  ): Promise<string[]> {
    if (params.period_id) {
      return [params.period_id];
    }

    const activePeriod = await this.cashFlowRepository.findActivePeriod(orgId);
    const fiscalYearId = activePeriod?.fiscal_year_id;
    if (!fiscalYearId) {
      return [];
    }

    if (params.ytd) {
      const currentMonth = new Date().getMonth() + 1;
      const periods = await this.cashFlowRepository.findPeriodsByRange(orgId, fiscalYearId, 1, currentMonth);
      return periods.map((p) => p.id);
    }

    if (params.quarter && params.quarter >= 1 && params.quarter <= 4) {
      const start = (params.quarter - 1) * 3 + 1;
      const end = start + 2;
      const periods = await this.cashFlowRepository.findPeriodsByRange(orgId, fiscalYearId, start, end);
      return periods.map((p) => p.id);
    }

    if (params.from_period && params.to_period) {
      const from = await this.cashFlowRepository.findPeriodDetails(params.from_period, orgId);
      const to = await this.cashFlowRepository.findPeriodDetails(params.to_period, orgId);
      if (!from || !to || from.fiscal_year_id !== to.fiscal_year_id) {
        return [];
      }
      const min = Math.min(from.period_number, to.period_number);
      const max = Math.max(from.period_number, to.period_number);
      const periods = await this.cashFlowRepository.findPeriodsByRange(orgId, from.fiscal_year_id, min, max);
      return periods.map((p) => p.id);
    }

    return [];
  }

  private calculateRunwayWeeks(cashBalance: Prisma.Decimal, weeklyBurn: Prisma.Decimal): number | null {
    if (weeklyBurn.lte(new Prisma.Decimal('0'))) {
      return null;
    }

    const runway = cashBalance.div(weeklyBurn);
    return runway.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  }

  private toResponse(plan: RepoCashFlowPlan): CashFlowResponseDto {
    return {
      id: plan.id,
      period_id: plan.period_id,
      week_number: plan.week_number,
      planned_date: plan.planned_date,
      flow_type: plan.flow_type,
      direction: plan.direction,
      amount: plan.amount.toString(),
      bank_account_id: plan.bank_account_id,
      notes: plan.notes,
      label: plan.label,
      inflow: plan.inflow.toString(),
      outflow: plan.outflow.toString(),
      balance: plan.balance.toString(),
      runway_weeks: plan.runway_weeks,
      created_at: plan.created_at,
    };
  }
}
