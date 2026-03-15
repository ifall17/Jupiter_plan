import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { LineType, Prisma, UserRole } from '@prisma/client';

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
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponseDto<TransactionResponseDto>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = {
      org_id: params.currentUser.org_id,
      ...(params.period_id ? { period_id: params.period_id } : {}),
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

  async create(currentUser: TransactionsCurrentUser, dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    await this.ensurePeriodBelongsToOrg(dto.period_id, currentUser.org_id);

    const amount = Number.parseFloat(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const signedAmount = dto.line_type === LineType.EXPENSE ? -amount : amount;

    const transaction = await this.prisma.transaction.create({
      data: {
        org_id: currentUser.org_id,
        period_id: dto.period_id,
        account_code: dto.account_code.trim(),
        account_label: dto.label.trim(),
        department: dto.department,
        amount: new Prisma.Decimal(signedAmount.toFixed(2)),
        created_at: new Date(dto.transaction_date),
      },
      include: { period: { select: { id: true, label: true } } },
    });

    return this.toResponse(transaction);
  }

  async validateBatch(currentUser: TransactionsCurrentUser, ids: string[]) {
    const result = await this.prisma.transaction.updateMany({
      where: { id: { in: ids }, org_id: currentUser.org_id },
      data: { is_validated: true, validated_by: currentUser.sub },
    });

    return { updated: result.count };
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
    const numericAmount = Number(item.amount);
    return {
      id: item.id,
      period_id: item.period_id,
      transaction_date: item.created_at,
      account_code: item.account_code,
      label: item.account_label,
      department: item.department,
      line_type: numericAmount >= 0 ? LineType.REVENUE : LineType.EXPENSE,
      amount: Math.abs(numericAmount).toFixed(2),
      is_validated: item.is_validated,
      created_at: item.created_at,
    };
  }
}
