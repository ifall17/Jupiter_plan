import { BadRequestException } from '@nestjs/common';
import { LineType, Prisma, UserRole } from '@prisma/client';
import { SyscohadaMappingService } from '../../common/services/syscohada-mapping.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionsService, type TransactionsCurrentUser } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    period: {
      findMany: jest.Mock;
    };
    budgetLine: {
      updateMany: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let syscohadaMappingService: {
    resolveSingleLineType: jest.Mock;
  };
  const currentUser: TransactionsCurrentUser = {
    sub: 'user-1',
    org_id: 'org-1',
    role: UserRole.FPA,
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      period: {
        findMany: jest.fn(),
      },
      budgetLine: {
        updateMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (trx: typeof prisma) => Promise<unknown>) => callback(prisma));
    syscohadaMappingService = {
      resolveSingleLineType: jest.fn(),
    };
    service = new TransactionsService(
      prisma as unknown as PrismaService,
      syscohadaMappingService as unknown as SyscohadaMappingService,
    );
  });

  it('reclasse le signe si le compte change sans changer le montant', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      org_id: 'org-1',
      period_id: 'period-1',
      account_code: '701000',
      account_label: 'Ventes',
      department: 'VENTES',
      amount: new Prisma.Decimal('1000'),
      created_at: new Date('2026-03-23T00:00:00.000Z'),
      is_validated: false,
    });
    syscohadaMappingService.resolveSingleLineType.mockResolvedValue('EXPENSE');
    prisma.transaction.update.mockResolvedValue({
      id: 'tx-1',
      period_id: 'period-1',
      account_code: '601000',
      account_label: 'Ventes',
      department: 'VENTES',
      amount: new Prisma.Decimal('-1000'),
      created_at: new Date('2026-03-23T00:00:00.000Z'),
      is_validated: false,
      period: { id: 'period-1', label: 'Mars 2026' },
    });

    const result = await service.update(currentUser, 'tx-1', {
      account_code: '601000',
    });

    expect(syscohadaMappingService.resolveSingleLineType).toHaveBeenCalledWith('601000', '1000', 'org-1');
    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          account_code: '601000',
          amount: new Prisma.Decimal('-1000'),
        }),
      }),
    );
    expect(result.line_type).toBe(LineType.EXPENSE);
  });

  it('conserve le fallback utilisateur si le mapping retourne OTHER', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-2',
      org_id: 'org-1',
      period_id: 'period-1',
      account_code: '821000',
      account_label: 'Memo',
      department: 'ADMIN',
      amount: new Prisma.Decimal('1000'),
      created_at: new Date('2026-03-23T00:00:00.000Z'),
      is_validated: false,
    });
    syscohadaMappingService.resolveSingleLineType.mockResolvedValue('OTHER');
    prisma.transaction.update.mockResolvedValue({
      id: 'tx-2',
      period_id: 'period-1',
      account_code: '821000',
      account_label: 'Memo',
      department: 'ADMIN',
      amount: new Prisma.Decimal('-2500'),
      created_at: new Date('2026-03-23T00:00:00.000Z'),
      is_validated: false,
      period: { id: 'period-1', label: 'Mars 2026' },
    });

    const result = await service.update(currentUser, 'tx-2', {
      amount: '2500',
      line_type: LineType.EXPENSE,
    });

    expect(syscohadaMappingService.resolveSingleLineType).toHaveBeenCalledWith('821000', '2500', 'org-1');
    expect(result.line_type).toBe(LineType.EXPENSE);
  });

  it('rejette un montant invalide avant toute resolution', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-3',
      org_id: 'org-1',
      period_id: 'period-1',
      account_code: '701000',
      account_label: 'Ventes',
      department: 'VENTES',
      amount: new Prisma.Decimal('1000'),
      created_at: new Date('2026-03-23T00:00:00.000Z'),
      is_validated: false,
    });

    await expect(service.update(currentUser, 'tx-3', { amount: '0' })).rejects.toThrow(BadRequestException);
    expect(syscohadaMappingService.resolveSingleLineType).not.toHaveBeenCalled();
  });

  it('synchronise les réalisés par compte et département sans exiger le même libellé', async () => {
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.period.findMany.mockResolvedValue([{ id: 'period-1' }]);
    prisma.transaction.findMany.mockResolvedValue([
      {
        account_code: '601000',
        account_label: 'Achats MP import',
        department: 'PROD',
        amount: new Prisma.Decimal('-45000'),
      },
    ]);
    prisma.budgetLine.findMany.mockResolvedValue([{ id: 'line-1' }]);
    prisma.budgetLine.updateMany.mockResolvedValue({ count: 3 });
    prisma.budgetLine.update.mockResolvedValue({ id: 'line-1' });

    const result = await service.validateBatch(currentUser, ['tx-1']);

    expect(result).toEqual({ updated: 1 });
    expect(prisma.budgetLine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ org_id: 'org-1', period_id: 'period-1' }),
        data: expect.objectContaining({ amount_actual: new Prisma.Decimal('0') }),
      }),
    );
    expect(prisma.budgetLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          org_id: 'org-1',
          period_id: 'period-1',
          account_code: '601000',
          department: 'PROD',
        }),
      }),
    );
    expect(prisma.budgetLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount_actual: new Prisma.Decimal('45000') }),
      }),
    );
  });
});