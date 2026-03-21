import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { LineType, PeriodStatus, Prisma, UserRole } from '@prisma/client';

export interface TransactionsCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    currentUser: TransactionsCurrentUser;
    period_id?: string;
    department?: string;
    line_type?: LineType;
    ytd?: boolean;
    quarter?: number;
    from_period?: string;
    to_period?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponseDto<TransactionResponseDto>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const periodIds = await this.resolvePeriodIds(params.currentUser.org_id, {
      period_id: params.period_id,
      ytd: params.ytd,
      quarter: params.quarter,
      from_period: params.from_period,
      to_period: params.to_period,
    });

    const periodFilter: Prisma.TransactionWhereInput =
      periodIds.length > 0
        ? { period_id: { in: periodIds } }
        : params.period_id
          ? { period_id: params.period_id }
          : {};

    const where: Prisma.TransactionWhereInput = {
      org_id: params.currentUser.org_id,
      ...periodFilter,
      ...(params.department ? { department: params.department } : {}),
      ...(params.line_type
        ? params.line_type === LineType.REVENUE
          ? { amount: { gt: 0 } }
          : { amount: { lt: 0 } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: { period: { select: { id: true, label: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: items.map((item) => this.toResponse(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async resolvePeriodIds(
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
    if (!fiscalYearId) {
      return [];
    }

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

  async create(currentUser: TransactionsCurrentUser, dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    await this.ensurePeriodBelongsToOrg(dto.period_id, currentUser.org_id);

    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(dto.amount);
    } catch {
      throw new BadRequestException('Amount must be positive');
    }

    if (amount.lte(new Prisma.Decimal('0'))) {
      throw new BadRequestException('Amount must be positive');
    }

    const signedAmount =
      dto.line_type === LineType.EXPENSE ? amount.abs().negated() : amount.abs();

    const transaction = await this.prisma.transaction.create({
      data: {
        org_id: currentUser.org_id,
        period_id: dto.period_id,
        account_code: dto.account_code.trim(),
        account_label: dto.label.trim(),
        department: dto.department,
        amount: signedAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        created_at: new Date(dto.transaction_date),
      },
      include: { period: { select: { id: true, label: true } } },
    });

    return this.toResponse(transaction);
  }

  async validateBatch(currentUser: TransactionsCurrentUser, ids: string[]) {
    // Validate transactions and sync to budget_lines in a single transaction
    const result = await this.prisma.$transaction(async (trx: any) => {
      // Step 1: Update transactions to validated
      const updateResult = await trx.transaction.updateMany({
        where: { id: { in: ids }, org_id: currentUser.org_id },
        data: { is_validated: true, validated_by: currentUser.sub },
      });

      if (updateResult.count > 0) {
        // Step 2: Sync to budget_lines
        await this.syncBudgetLines(currentUser.org_id, trx);
      }

      return { updated: updateResult.count };
    });

    return result;
  }

  async update(
    currentUser: TransactionsCurrentUser,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    // Check if transaction exists and belongs to current user's org
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, org_id: currentUser.org_id },
    });

    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    // Only allow edit if not validated
    if (transaction.is_validated) {
      throw new BadRequestException('Cannot modify a validated transaction');
    }

    // Validate period if changing it
    if (dto.period_id && dto.period_id !== transaction.period_id) {
      await this.ensurePeriodBelongsToOrg(dto.period_id, currentUser.org_id);
    }

    // Parse and validate amount if provided
    let signedAmount = transaction.amount;
    if (dto.amount) {
      let amount: Prisma.Decimal;
      try {
        amount = new Prisma.Decimal(dto.amount);
      } catch {
        throw new BadRequestException('Amount must be positive');
      }

      if (amount.lte(new Prisma.Decimal('0'))) {
        throw new BadRequestException('Amount must be positive');
      }

      const lineType = dto.line_type ?? this.getLineTypeFromAmount(transaction.amount);
      signedAmount =
        lineType === LineType.EXPENSE ? amount.abs().negated() : amount.abs();
    }

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        period_id: dto.period_id ?? transaction.period_id,
        account_code: dto.account_code ? dto.account_code.trim() : transaction.account_code,
        account_label: dto.label ? dto.label.trim() : transaction.account_label,
        department: dto.department ?? transaction.department,
        amount: signedAmount,
        created_at: dto.transaction_date ? new Date(dto.transaction_date) : transaction.created_at,
      },
      include: { period: { select: { id: true, label: true } } },
    });

    return this.toResponse(updated);
  }

  async delete(currentUser: TransactionsCurrentUser, id: string): Promise<{ success: boolean }> {
    // Check if transaction exists and belongs to current user's org
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, org_id: currentUser.org_id },
    });

    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    // Only allow delete if not validated
    if (transaction.is_validated) {
      throw new BadRequestException('Cannot delete a validated transaction');
    }

    await this.prisma.transaction.delete({
      where: { id },
    });

    return { success: true };
  }

  private async syncBudgetLines(orgId: string, trx: any = this.prisma) {
    // Get all periods for org to determine what to sync
    const periods = await trx.period.findMany({
      where: { organization: { id: orgId } },
      select: { id: true },
    });

    if (periods.length === 0) return;

    // For each period, aggregate validated transactions and update budget_lines
    for (const period of periods) {
      // Get all validated transactions for this period grouped by key fields
      const transactions = await trx.transaction.findMany({
        where: {
          org_id: orgId,
          period_id: period.id,
          is_validated: true,
        },
        select: {
          account_code: true,
          account_label: true,
          department: true,
          amount: true,
        },
      });

      // Group transactions by (account_code, account_label, department)
      const grouped = new Map<string, Prisma.Decimal>();
      for (const tx of transactions) {
        const key = `${tx.account_code}|${tx.account_label}|${tx.department}`;
        const existing = grouped.get(key) ?? new Prisma.Decimal('0');
        grouped.set(key, existing.plus(tx.amount));
      }

      // Update budget_lines for this period
      for (const [key, totalAmount] of grouped.entries()) {
        const [accountCode, accountLabel, department] = key.split('|');
        
        // Find all budget_lines matching this transaction group
        const budgetLines = await trx.budgetLine.findMany({
          where: {
            org_id: orgId,
            period_id: period.id,
            account_code: accountCode,
            account_label: accountLabel,
            department: department,
          },
          select: { id: true },
        });

        // Update amount_actual for all matching budget lines
        for (const budgetLine of budgetLines) {
          await trx.budgetLine.update({
            where: { id: budgetLine.id },
            data: {
              amount_actual: totalAmount.abs(), // Use absolute value to avoid negative actuals
            },
          });
        }
      }
    }
  }

  private async ensurePeriodBelongsToOrg(periodId: string, orgId: string): Promise<void> {
    const period = await this.prisma.period.findFirst({
      where: { id: periodId, fiscal_year: { org_id: orgId } },
      select: { id: true },
    });

    if (!period) {
      throw new UnauthorizedException();
    }
  }

  private getLineTypeFromAmount(amount: Prisma.Decimal): LineType {
    return amount.gte(new Prisma.Decimal('0')) ? LineType.REVENUE : LineType.EXPENSE;
  }

  private toResponse(item: {
    id: string;
    period_id: string;
    created_at: Date;
    account_code: string;
    account_label: string;
    department: string;
    amount: Prisma.Decimal;
    is_validated: boolean;
  }): TransactionResponseDto {
    const isRevenue = item.amount.gte(new Prisma.Decimal('0'));
    return {
      id: item.id,
      period_id: item.period_id,
      transaction_date: item.created_at,
      account_code: item.account_code,
      label: item.account_label,
      department: item.department,
      line_type: isRevenue ? LineType.REVENUE : LineType.EXPENSE,
      amount: item.amount.abs().toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
      is_validated: item.is_validated,
      created_at: item.created_at,
    };
  }
}
