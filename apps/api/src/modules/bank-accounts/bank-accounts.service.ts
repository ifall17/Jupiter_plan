import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { AuditAction, UserRole } from '@shared/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { BankAccountResponseDto } from './dto/bank-account-response.dto';

export interface BankAccountCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listActive(currentUser: BankAccountCurrentUser): Promise<BankAccountResponseDto[]> {
    const rows = await this.prisma.bankAccount.findMany({
      where: { org_id: currentUser.org_id, is_active: true },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  async create(currentUser: BankAccountCurrentUser, dto: CreateBankAccountDto): Promise<BankAccountResponseDto> {
    const row = await this.prisma.bankAccount.create({
      data: {
        org_id: currentUser.org_id,
        name: dto.name.trim(),
        account_type: dto.account_type as AccountType,
        balance: new Prisma.Decimal(dto.balance),
        currency: dto.currency?.trim() || 'XOF',
      },
    });

    return this.toResponse(row);
  }

  async updateBalance(
    currentUser: BankAccountCurrentUser,
    id: string,
    balance: string,
    ipAddress?: string,
  ): Promise<BankAccountResponseDto> {
    try {
      new Prisma.Decimal(balance);
    } catch {
      throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'Invalid decimal amount.' });
    }

    const existing = await this.prisma.bankAccount.findFirst({
      where: { id, org_id: currentUser.org_id },
    });

    if (!existing) {
      throw new NotFoundException();
    }

    const row = await this.prisma.bankAccount.update({
      where: { id: existing.id },
      data: { balance: new Prisma.Decimal(balance) },
    });

    await this.auditService.createLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.BALANCE_UPDATE,
      entity_type: 'BANK_ACCOUNT',
      entity_id: row.id,
      ip_address: ipAddress,
      metadata: {
        previous_balance: existing.balance.toString(),
        new_balance: row.balance.toString(),
      },
    });

    return this.toResponse(row);
  }

  private toResponse(row: {
    id: string;
    name: string;
    account_type: AccountType;
    balance: Prisma.Decimal;
    currency: string;
    is_active: boolean;
  }): BankAccountResponseDto {
    return {
      id: row.id,
      name: row.name,
      account_type: row.account_type,
      balance: row.balance.toString(),
      currency: row.currency,
      is_active: row.is_active,
    };
  }
}
