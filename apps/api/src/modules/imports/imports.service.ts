import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import ExcelJS = require('exceljs');
import { ImportSource, ImportStatus, LineType, Prisma, UserRole } from '@prisma/client';
import { AuditAction } from '@shared/enums';
import { AuditService } from '../../common/services/audit.service';
import { EventsGateway } from '../../common/services/events.gateway';
import { PrismaService } from '../../prisma/prisma.service';
import { SyscohadaMappingService } from '../../common/services/syscohada-mapping.service';

export interface ImportsCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
}

export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMPORT_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

type ImportErrorCode =
  | 'IMPORT_FILE_REQUIRED'
  | 'IMPORT_FILE_TYPE_INVALID'
  | 'IMPORT_FILE_SIGNATURE_INVALID'
  | 'IMPORT_FILE_TOO_LARGE'
  | 'IMPORT_PERIOD_UNAUTHORIZED'
  | 'IMPORT_WORKBOOK_EMPTY'
  | 'IMPORT_PROCESSING_FAILED';

function importBadRequest(code: ImportErrorCode, message: string, details?: Record<string, unknown>): BadRequestException {
  return new BadRequestException({ code, message, ...(details ? { details } : {}) });
}

function isAllowedImportMimeType(mimetype: string | undefined): boolean {
  return typeof mimetype === 'string' && ALLOWED_IMPORT_MIME_TYPES.has(mimetype);
}

function hasXlsxZipSignature(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }

  const signature = buffer.subarray(0, 4).toString('hex').toUpperCase();
  return signature === '504B0304' || signature === '504B0506' || signature === '504B0708';
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeAmountString(value: unknown): string {
  const raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/[A-Za-z$€£¥₣]/g, '')
    .replace(/'/g, '');

  if (!raw) {
    return '';
  }

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      return raw.replace(/\./g, '').replace(/,/g, '.');
    }
    return raw.replace(/,/g, '');
  }

  if (lastComma !== -1) {
    return raw.replace(/,/g, '.');
  }

  return raw;
}

function readAmount(value: unknown): Prisma.Decimal | null {
  const normalized = normalizeAmountString(value);
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  try {
    return new Prisma.Decimal(normalized);
  } catch {
    return null;
  }
}

function buildServerFileName(): string {
  return `import_${randomUUID()}.xlsx`;
}

function parseLineType(raw: string): LineType | null {
  const normalized = normalizeHeader(raw);
  if (['expense', 'charge', 'depense', 'cout', 'cost'].includes(normalized)) {
    return LineType.EXPENSE;
  }
  if (['revenue', 'revenu', 'produit', 'income', 'recette'].includes(normalized)) {
    return LineType.REVENUE;
  }
  return null;
}

async function readWorkbookRows(buffer: Buffer): Promise<Array<Record<string, unknown>>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headerRow = worksheet.getRow(1);
  const headers = (headerRow.values as any[])
    .slice(1)
    .map((value: any) => String(value ?? '').trim());

  if (headers.every((header: any) => header.length === 0)) {
    return [];
  }

  const rows: Array<Record<string, unknown>> = [];

  worksheet.eachRow((row: any, rowNumber: any) => {
    if (rowNumber === 1) {
      return;
    }

    const record: Record<string, unknown> = {};
    let hasValue = false;

    headers.forEach((header: any, index: any) => {
      const cellValue = row.getCell(index + 1).value;
      const normalizedValue = normalizeWorksheetCellValue(cellValue);
      if (header) {
        record[header] = normalizedValue;
      }
      if (String(normalizedValue ?? '').trim() !== '') {
        hasValue = true;
      }
    });

    if (hasValue) {
      rows.push(record);
    }
  });

  return rows;
}

function normalizeWorksheetCellValue(value: ExcelJS.CellValue | undefined): unknown {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text;
  }

  if (typeof value === 'object' && 'result' in value) {
    return normalizeWorksheetCellValue(value.result as ExcelJS.CellValue | undefined);
  }

  return String(value);
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventsGateway: EventsGateway,
    private readonly syscohadaMappingService: SyscohadaMappingService,
  ) {}

  async processImport(
    file: Express.Multer.File,
    periodId: string | undefined,
    orgId: string,
    createdBy: string,
    ipAddress?: string,
  ) {
    if (!file) {
      throw importBadRequest('IMPORT_FILE_REQUIRED', 'File is required');
    }
    if (!isAllowedImportMimeType(file.mimetype)) {
      throw importBadRequest('IMPORT_FILE_TYPE_INVALID', 'Only .xlsx MIME types are supported', {
        mimetype: file.mimetype ?? null,
      });
    }
    if (!hasXlsxZipSignature(file.buffer)) {
      throw importBadRequest('IMPORT_FILE_SIGNATURE_INVALID', 'The uploaded file is not a valid .xlsx archive');
    }
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      throw importBadRequest('IMPORT_FILE_TOO_LARGE', 'File too large', {
        max_bytes: MAX_IMPORT_FILE_SIZE_BYTES,
      });
    }

    if (periodId) {
      const period = await this.prisma.period.findFirst({
        where: { id: periodId, fiscal_year: { org_id: orgId } },
        select: { id: true },
      });
      if (!period) {
        throw new UnauthorizedException({
          code: 'IMPORT_PERIOD_UNAUTHORIZED',
          message: 'The selected period is not accessible for this organization',
        });
      }
    }

    const safeFileName = buildServerFileName();

    const job = await this.prisma.importJob.create({
      data: {
        org_id: orgId,
        ...(periodId ? { period_id: periodId } : {}),
        created_by: createdBy,
        source: ImportSource.EXCEL,
        status: ImportStatus.PENDING,
        file_name: safeFileName,
        file_size_kb: Math.max(1, Math.round(file.size / 1024)),
        started_at: new Date(),
      },
    });

    await this.safeCreateAuditLog({
      org_id: orgId,
      user_id: createdBy,
      action: AuditAction.IMPORT_START,
      entity_type: 'import_job',
      entity_id: job.id,
      ip_address: ipAddress,
      metadata: {
        source: ImportSource.EXCEL,
        file_name: safeFileName,
        file_size_kb: Math.max(1, Math.round(file.size / 1024)),
        mimetype: file.mimetype ?? null,
      },
    });

    try {
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: { status: ImportStatus.PROCESSING },
      });

      this.eventsGateway.emitToOrg(orgId, 'IMPORT_PROGRESS', {
        job_id: job.id,
        progress: 10,
        status: ImportStatus.PROCESSING,
      });

      const rows = await readWorkbookRows(file.buffer);
      if (!rows.length) {
        throw importBadRequest('IMPORT_WORKBOOK_EMPTY', 'Workbook is empty');
      }

      const orgPeriods = await this.prisma.period.findMany({
        where: { org_id: orgId },
        select: { id: true, start_date: true, end_date: true },
      });

      const transactions: Prisma.TransactionCreateManyInput[] = [];
      let rowsSkipped = 0;
      const errors: Array<{ row: number; error: string; value: string }> = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rowNumber = index + 2;
        const normalized = new Map<string, unknown>();
        Object.entries(row).forEach(([key, value]) => normalized.set(normalizeHeader(key), value));

        const accountCode = String(
          normalized.get('accountcode') ??
            normalized.get('code') ??
            normalized.get('codecomptable') ??
            normalized.get('syscohadacode') ??
            '',
        ).trim();
        const label = String(normalized.get('accountlabel') ?? normalized.get('label') ?? normalized.get('libelle') ?? '').trim();
        const department = String(normalized.get('department') ?? normalized.get('departement') ?? '').trim().toUpperCase();
        const lineTypeRaw = String(normalized.get('linetype') ?? normalized.get('type') ?? '').trim();
        const amountValue = normalized.get('amount') ?? normalized.get('montant') ?? '';
        const transactionDateRaw = normalized.get('transactiondate') ?? normalized.get('date') ?? '';

        if (!accountCode || !/^\d{6}$/.test(accountCode)) {
          rowsSkipped += 1;
          errors.push({ row: rowNumber, error: 'INVALID_SYSCOHADA_CODE', value: accountCode });
          continue;
        }

        if (!label || !department) {
          rowsSkipped += 1;
          errors.push({ row: rowNumber, error: 'MISSING_REQUIRED_FIELDS', value: `${label}|${department}` });
          continue;
        }

        const parsedAmount = readAmount(amountValue);
        if (!parsedAmount || parsedAmount.lte(0)) {
          rowsSkipped += 1;
          errors.push({ row: rowNumber, error: 'INVALID_AMOUNT', value: String(amountValue ?? '') });
          continue;
        }

        // Resolve line_type from SYSCOHADA mapping (database priority)
        // Keep user-input parsing as hint but prefer DB resolution
        const lineTypeHint = parseLineType(lineTypeRaw);
        const resolvedLineTypeStr = await this.syscohadaMappingService.resolveSingleLineType(
          accountCode,
          parsedAmount.toString(),
          orgId,
        );
        const lineType =
          resolvedLineTypeStr === 'REVENUE'
            ? LineType.REVENUE
            : resolvedLineTypeStr === 'EXPENSE'
              ? LineType.EXPENSE
              : lineTypeHint; // fallback to parsed hint if resolved to OTHER

        if (!lineType) {
          rowsSkipped += 1;
          errors.push({ row: rowNumber, error: 'INVALID_LINE_TYPE', value: lineTypeRaw });
          continue;
        }

        const transactionDate = transactionDateRaw instanceof Date ? transactionDateRaw : new Date(String(transactionDateRaw));
        if (Number.isNaN(transactionDate.getTime())) {
          rowsSkipped += 1;
          errors.push({ row: rowNumber, error: 'INVALID_TRANSACTION_DATE', value: String(transactionDateRaw ?? '') });
          continue;
        }

        const detectedPeriod = orgPeriods.find(
          (period) => transactionDate >= period.start_date && transactionDate <= period.end_date,
        );
        if (!detectedPeriod) {
          rowsSkipped += 1;
          errors.push({ row: rowNumber, error: 'NO_MATCHING_PERIOD_FOR_DATE', value: transactionDate.toISOString().slice(0, 10) });
          continue;
        }

        const absoluteAmount = parsedAmount.abs();
        const signedAmount = lineType === LineType.EXPENSE ? absoluteAmount.negated() : absoluteAmount;

        transactions.push({
          org_id: orgId,
          period_id: detectedPeriod.id,
          account_code: accountCode,
          account_label: label,
          department,
          amount: signedAmount.toDecimalPlaces(2),
          import_job_id: job.id,
          created_at: transactionDate,
        });
      }

      if (transactions.length > 0) {
        await this.prisma.transaction.createMany({ data: transactions });
      }

      const finalStatus = transactions.length === 0 ? ImportStatus.FAILED : ImportStatus.DONE;
      const errorReport: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =
        errors.length > 0 ? (JSON.parse(JSON.stringify(errors)) as Prisma.InputJsonValue) : Prisma.JsonNull;

      const completedJob = await this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: finalStatus,
          rows_inserted: transactions.length,
          rows_skipped: rowsSkipped,
          error_report: errorReport,
          completed_at: new Date(),
        },
        select: {
          id: true,
          status: true,
          rows_inserted: true,
          rows_skipped: true,
          error_report: true,
        },
      });

      await this.safeCreateAuditLog({
        org_id: orgId,
        user_id: createdBy,
        action: AuditAction.IMPORT_DONE,
        entity_type: 'import_job',
        entity_id: completedJob.id,
        ip_address: ipAddress,
        metadata: {
          status: completedJob.status,
          rows_inserted: completedJob.rows_inserted ?? 0,
          rows_skipped: completedJob.rows_skipped ?? 0,
          has_errors: errors.length > 0,
        },
      });

      this.eventsGateway.emitToOrg(orgId, 'IMPORT_DONE', {
        job_id: completedJob.id,
        inserted: completedJob.rows_inserted ?? 0,
        skipped: completedJob.rows_skipped ?? 0,
        status: completedJob.status,
      });

      return {
        job_id: completedJob.id,
        status: completedJob.status,
        rows_inserted: completedJob.rows_inserted,
        rows_skipped: completedJob.rows_skipped,
        error_report: completedJob.error_report,
      };
    } catch (error) {
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: ImportStatus.FAILED,
          error_report: {
            code: 'IMPORT_PROCESSING_FAILED',
            message: 'Erreur de traitement du fichier',
          },
          completed_at: new Date(),
        },
      });

      await this.safeCreateAuditLog({
        org_id: orgId,
        user_id: createdBy,
        action: AuditAction.IMPORT_DONE,
        entity_type: 'import_job',
        entity_id: job.id,
        ip_address: ipAddress,
        metadata: {
          status: ImportStatus.FAILED,
          error_code: error instanceof BadRequestException ? 'IMPORT_PROCESSING_FAILED' : 'IMPORT_PROCESSING_FAILED',
        },
      });

      this.eventsGateway.emitToOrg(orgId, 'IMPORT_DONE', {
        job_id: job.id,
        inserted: 0,
        skipped: 0,
        status: ImportStatus.FAILED,
      });

      this.logger.error(`Import job ${job.id} failed`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  async upload(file: Express.Multer.File | undefined, periodId: string, currentUser: ImportsCurrentUser) {
    if (!file) {
      throw importBadRequest('IMPORT_FILE_REQUIRED', 'File is required');
    }

    return this.processImport(file, periodId, currentUser.org_id, currentUser.sub);
  }

  async getJob(jobId: string, currentUser: ImportsCurrentUser) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, org_id: currentUser.org_id },
      select: {
        id: true,
        status: true,
        rows_inserted: true,
        rows_skipped: true,
        file_name: true,
        error_report: true,
        created_at: true,
        started_at: true,
        completed_at: true,
      },
    });

    if (!job) {
      throw new NotFoundException();
    }

    return job;
  }

  private async safeCreateAuditLog(params: {
    org_id: string;
    user_id?: string;
    action: AuditAction;
    entity_type: string;
    entity_id?: string;
    ip_address?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.auditService.createLog(params);
    } catch (error) {
      this.logger.warn(
        `Failed to persist audit log ${params.action} for ${params.entity_type}:${params.entity_id ?? 'n/a'}`,
      );
      this.logger.debug(error instanceof Error ? error.message : 'Unknown audit log error');
    }
  }
}
