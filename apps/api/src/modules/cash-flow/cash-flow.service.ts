import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '@shared/enums';
import { CashFlowRepository, RepoCashFlowPlan } from './cash-flow.repository';
import { CashFlowResponseDto } from './dto/cash-flow-response.dto';
import { CreateCashFlowPlanDto } from './dto/create-cash-flow-plan.dto';

export interface CashFlowCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class CashFlowService {
  constructor(private readonly cashFlowRepository: CashFlowRepository) {}

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

    const plan = existing
      ? await this.cashFlowRepository.update(existing.id, currentUser.org_id, {
          label: dto.label.trim(),
          inflow,
          outflow,
          balance,
          runway_weeks: runwayWeeks,
        })
      : await this.cashFlowRepository.create({
          org_id: currentUser.org_id,
          period_id: dto.period_id,
          week_number: dto.week_number,
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

  private calculateRunwayWeeks(cashBalance: Prisma.Decimal, weeklyBurn: Prisma.Decimal): number | null {
    if (weeklyBurn.lte(new Prisma.Decimal('0'))) {
      return null;
    }

    const runway = cashBalance.div(weeklyBurn);
    return Number(runway.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
  }

  private toResponse(plan: RepoCashFlowPlan): CashFlowResponseDto {
    return {
      id: plan.id,
      period_id: plan.period_id,
      week_number: plan.week_number,
      label: plan.label,
      inflow: plan.inflow.toString(),
      outflow: plan.outflow.toString(),
      balance: plan.balance.toString(),
      runway_weeks: plan.runway_weeks,
      created_at: plan.created_at,
    };
  }
}
