import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PeriodStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { GenerateReportDto } from './dto/generate-report.dto';

export interface ReportsCurrentUser {
  sub: string;
  org_id: string;
}

type ReportPayloadData = {
  orgName: string;
  periodLabel: string;
  transactions: Array<{
    account_code: string;
    account_label: string;
    department: string;
    line_type: 'REVENUE' | 'EXPENSE';
    amount: string;
    transaction_date: string;
    is_validated: boolean;
    label: string;
  }>;
  cashFlowPlans: Array<{
    direction: string;
    amount: string;
    flow_type: string;
    label: string;
    planned_date: string;
  }>;
  kpis: Array<{
    label: string;
    value: string;
    unit: string;
    status: string;
    threshold_warn: string | null;
    threshold_critical: string | null;
  }>;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async generate(
    dto: GenerateReportDto,
    orgId: string,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const data = await this.getReportData(dto, orgId);
    const calcUrl = this.config.get<string>('CALC_ENGINE_URL') ?? this.config.get<string>('calcEngine.url');
    if (!calcUrl) {
      throw new InternalServerErrorException('CALC_ENGINE_URL is not configured');
    }
    let response: { data: ArrayBuffer };
    try {
      response = await firstValueFrom(
        this.httpService.post<ArrayBuffer>(
          `${calcUrl}/reports/generate`,
          {
            report_type: dto.report_type,
            format: dto.format,
            org_name: data.orgName,
            transactions: data.transactions,
            cash_flow_plans: data.cashFlowPlans,
            kpis: data.kpis,
            period_label: data.periodLabel,
          },
          {
            responseType: 'arraybuffer',
            timeout: 30000,
          },
        ),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown CalcEngine error';
      throw new InternalServerErrorException(`CalcEngine delegation failed: ${message}`);
    }

    const date = new Date().toISOString().slice(0, 10);
    const ext = dto.format === 'pdf' ? 'pdf' : 'xlsx';
    const name =
      {
        pl: 'Compte_de_resultat',
        balance_sheet: 'Bilan',
        cash_flow: 'Flux_de_Tresorerie',
        budget_variance: 'Budget_vs_Reel',
        transactions: 'Journal_Transactions',
        kpis: 'KPIs',
      }[dto.report_type] ?? dto.report_type;

    return {
      buffer: Buffer.from(response.data),
      filename: `${name}_${date}.${ext}`,
      contentType:
        dto.format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private async getPeriodIds(
    orgId: string,
    params: {
      period_id?: string;
      ytd?: boolean;
      quarter?: number;
      from_period?: string;
      to_period?: string;
    },
  ): Promise<string[]> {
    if (params.period_id) {
      return [params.period_id];
    }

    const activePeriod = await this.prisma.period.findFirst({
      where: { org_id: orgId, status: PeriodStatus.OPEN },
      select: { fiscal_year_id: true },
      orderBy: { period_number: 'desc' },
    });

    const fiscalYearId = activePeriod?.fiscal_year_id;
    if (!fiscalYearId) return [];

    if (params.ytd) {
      const currentMonth = new Date().getMonth() + 1;
      const periods = await this.prisma.period.findMany({
        where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { lte: currentMonth } },
        select: { id: true },
        orderBy: { period_number: 'asc' },
      });
      return periods.map((p) => p.id);
    }

    if (params.quarter && params.quarter >= 1 && params.quarter <= 4) {
      const start = (params.quarter - 1) * 3 + 1;
      const end = start + 2;
      const periods = await this.prisma.period.findMany({
        where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { gte: start, lte: end } },
        select: { id: true },
        orderBy: { period_number: 'asc' },
      });
      return periods.map((p) => p.id);
    }

    if (params.from_period && params.to_period) {
      const bounds = await this.prisma.period.findMany({
        where: {
          org_id: orgId,
          id: { in: [params.from_period, params.to_period] },
          fiscal_year_id: fiscalYearId,
        },
        select: { id: true, period_number: true },
      });
      if (bounds.length < 2) return [];

      const from = bounds.find((b) => b.id === params.from_period);
      const to = bounds.find((b) => b.id === params.to_period);
      if (!from || !to) return [];

      const min = Math.min(from.period_number, to.period_number);
      const max = Math.max(from.period_number, to.period_number);
      const periods = await this.prisma.period.findMany({
        where: { org_id: orgId, fiscal_year_id: fiscalYearId, period_number: { gte: min, lte: max } },
        select: { id: true },
        orderBy: { period_number: 'asc' },
      });
      return periods.map((p) => p.id);
    }

    return [];
  }

  private async getReportData(dto: GenerateReportDto, orgId: string): Promise<ReportPayloadData> {
    const periodIds = await this.getPeriodIds(orgId, dto);

    const [org, transactions, cashFlowPlans, kpiValues] = await Promise.all([
      this.prisma.organization.findFirst({
        where: { id: orgId },
        select: { name: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          org_id: orgId,
          period_id: { in: periodIds },
        },
        select: {
          account_code: true,
          account_label: true,
          department: true,
          amount: true,
          is_validated: true,
          period: { select: { start_date: true } },
        },
        orderBy: { account_code: 'asc' },
      }),
      this.prisma.cashFlowPlan.findMany({
        where: { org_id: orgId },
        select: {
          direction: true,
          amount: true,
          flow_type: true,
          planned_date: true,
          label: true,
        },
        orderBy: { planned_date: 'asc' },
      }),
      this.prisma.kpiValue.findMany({
        where: {
          org_id: orgId,
          period_id: { in: periodIds },
          scenario_id: null,
        },
        include: { kpi: true },
      }),
    ]);

    let periodLabel = 'Periode selectionnee';
    if (dto.period_id) {
      const period = await this.prisma.period.findUnique({ where: { id: dto.period_id }, select: { label: true } });
      periodLabel = period?.label ?? periodLabel;
    } else if (dto.ytd) {
      const month = new Date().toLocaleDateString('fr-FR', { month: 'long' });
      periodLabel = `YTD Janvier -> ${month}`;
    } else if (dto.quarter) {
      periodLabel = `T${dto.quarter} 2026`;
    } else if (dto.from_period && dto.to_period) {
      const bounds = await this.prisma.period.findMany({
        where: { id: { in: [dto.from_period, dto.to_period] }, org_id: orgId },
        select: { id: true, label: true },
      });
      const from = bounds.find((b) => b.id === dto.from_period);
      const to = bounds.find((b) => b.id === dto.to_period);
      if (from && to) {
        periodLabel = `Plage ${from.label} -> ${to.label}`;
      }
    }

    return {
      orgName: org?.name ?? 'Organisation',
      periodLabel,
      transactions: transactions.map((t) => ({
        account_code: t.account_code,
        account_label: t.account_label,
        department: t.department,
        line_type: t.account_code.startsWith('7') || t.amount.gte(0) ? 'REVENUE' : 'EXPENSE',
        amount: t.amount.toString(),
        transaction_date: (t.period?.start_date ?? new Date()).toISOString(),
        is_validated: t.is_validated,
        label: t.account_label,
      })),
      cashFlowPlans: cashFlowPlans.map((p) => ({
        direction: p.direction,
        amount: p.amount.toString(),
        flow_type: p.flow_type,
        label: p.label,
        planned_date: (p.planned_date ?? new Date()).toISOString(),
      })),
      kpis: kpiValues.map((k) => ({
        label: k.kpi.label,
        value: k.value.toString(),
        unit: k.kpi.unit,
        status: k.severity,
        threshold_warn: k.kpi.threshold_warn?.toString() ?? null,
        threshold_critical: k.kpi.threshold_critical?.toString() ?? null,
      })),
    };
  }
}
