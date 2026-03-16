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
      where: { org_id: currentUser.org_id },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  async create(currentUser: BankAccountCurrentUser, dto: CreateBankAccountDto): Promise<BankAccountResponseDto> {
    const resolvedName =
      dto.name?.trim() ||
      [dto.bank_name?.trim(), dto.account_name?.trim()].filter(Boolean).join(' - ');

    if (!resolvedName) {
      throw new BadRequestException({ code: 'INVALID_NAME', message: 'name is required' });
    }

    const resolvedBalance = dto.balance ?? dto.current_balance ?? '0';

    const row = await this.prisma.bankAccount.create({
      data: {
        org_id: currentUser.org_id,
        name: resolvedName,
        bank_name: dto.bank_name?.trim() || null,
        account_name: dto.account_name?.trim() || null,
        account_number: dto.account_number?.trim() || null,
        account_type: (dto.account_type as AccountType) ?? AccountType.BANK,
        balance: new Prisma.Decimal(resolvedBalance),
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
    bank_name: string | null;
    account_name: string | null;
    account_number: string | null;
    account_type: AccountType;
    balance: Prisma.Decimal;
    currency: string;
    is_active: boolean;
  }): BankAccountResponseDto {
    return {
      id: row.id,
      name: row.name,
      bank_name: row.bank_name,
      account_name: row.account_name,
      account_number: row.account_number,
      account_type: row.account_type,
      balance: row.balance.toString(),
      current_balance: row.balance.toString(),
      currency: row.currency,
      is_active: row.is_active,
    };
  }
}
