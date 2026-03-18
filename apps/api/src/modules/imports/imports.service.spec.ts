import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ImportStatus, LineType, Prisma } from '@prisma/client';
import { AuditAction } from '@shared/enums';
import * as XLSX from 'xlsx';
import { AuditService } from '../../common/services/audit.service';
import { ImportsService } from './imports.service';

function buildWorkbookBuffer(rows: Array<Array<string>>): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Import');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

describe('ImportsService', () => {
  let service: ImportsService;
  let prisma: {
    period: { findFirst: jest.Mock };
    importJob: { create: jest.Mock; update: jest.Mock; findFirst?: jest.Mock };
    transaction: { createMany: jest.Mock };
  };
  let auditService: jest.Mocked<AuditService>;

  beforeEach(() => {
    prisma = {
      period: { findFirst: jest.fn() },
      importJob: { create: jest.fn(), update: jest.fn() },
      transaction: { createMany: jest.fn() },
    };

    auditService = {
      createLog: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    service = new ImportsService(prisma as never, auditService);
  });

  it('should reject invalid MIME types with a coded error', async () => {
    const file = {
      originalname: 'import.xlsx',
      mimetype: 'text/plain',
      size: 16,
      buffer: Buffer.from('not-an-xlsx-file'),
    } as Express.Multer.File;

    let thrown: unknown;
    try {
      await service.processImport(file, 'period-1', 'org-1', 'user-1');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as BadRequestException).getResponse()).toMatchObject({
      code: 'IMPORT_FILE_TYPE_INVALID',
    });
  });

  it('should persist a server generated filename and Decimal amounts', async () => {
    const buffer = buildWorkbookBuffer([
      ['Code Comptable', 'Libelle', 'Departement', 'Type', 'Montant', 'Date'],
      ['601000', 'Achats', 'OPS', 'depense', '1 234,50', '2026-03-01'],
    ]);
    const file = {
      originalname: 'mon_fichier_client.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    prisma.period.findFirst.mockResolvedValue({ id: 'period-1' });
    prisma.importJob.create.mockResolvedValue({ id: 'job-1' });
    prisma.importJob.update
      .mockResolvedValueOnce({ id: 'job-1', status: ImportStatus.PROCESSING })
      .mockResolvedValueOnce({
        id: 'job-1',
        status: ImportStatus.DONE,
        rows_inserted: 1,
        rows_skipped: 0,
        error_report: null,
      });
    prisma.transaction.createMany.mockResolvedValue({ count: 1 });

    await service.processImport(file, 'period-1', 'org-1', 'user-1', '127.0.0.1');

    expect(prisma.importJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          file_name: expect.stringMatching(/^import_[0-9a-f-]+\.xlsx$/),
        }),
      }),
    );
    expect(prisma.importJob.create.mock.calls[0][0].data.file_name).not.toBe(file.originalname);

    const createdTransaction = prisma.transaction.createMany.mock.calls[0][0].data[0];
    expect(createdTransaction.line_type).toBeUndefined();
    expect(createdTransaction.amount).toBeInstanceOf(Prisma.Decimal);
    expect((createdTransaction.amount as Prisma.Decimal).toString()).toBe('-1234.5');
    expect(auditService.createLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: AuditAction.IMPORT_START, entity_id: 'job-1' }),
    );
    expect(auditService.createLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: AuditAction.IMPORT_DONE, entity_id: 'job-1' }),
    );
  });

  it('should reject periods outside the organization with a coded unauthorized error', async () => {
    const buffer = buildWorkbookBuffer([
      ['Code Comptable', 'Libelle', 'Departement', 'Type', 'Montant', 'Date'],
      ['701000', 'Ventes', 'SALES', 'revenu', '2500', '2026-03-01'],
    ]);
    const file = {
      originalname: 'import.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    prisma.period.findFirst.mockResolvedValue(null);

    let thrown: unknown;
    try {
      await service.processImport(file, 'period-other-org', 'org-1', 'user-1');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnauthorizedException);
    expect((thrown as UnauthorizedException).getResponse()).toMatchObject({
      code: 'IMPORT_PERIOD_UNAUTHORIZED',
    });
  });
});