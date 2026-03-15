import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ImportSource, ImportStatus, LineType, Prisma, UserRole } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';

export interface ImportsCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function readAmount(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  const normalized = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[A-Za-z$€£¥₣]/g, '');

  return Number.parseFloat(normalized);
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

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processImport(file: Express.Multer.File, periodId: string, orgId: string, createdBy: string) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Only .xlsx files are supported');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File too large');
    }

    const period = await this.prisma.period.findFirst({
      where: { id: periodId, fiscal_year: { org_id: orgId } },
      select: { id: true },
    });
    if (!period) {
      throw new UnauthorizedException();
    }

    const job = await this.prisma.importJob.create({
      data: {
        org_id: orgId,
        period_id: periodId,
        created_by: createdBy,
        source: ImportSource.EXCEL,
        status: ImportStatus.PENDING,
        file_name: file.originalname,
        file_size_kb: Math.max(1, Math.round(file.size / 1024)),
        started_at: new Date(),
      },
    });

    try {
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: { status: ImportStatus.PROCESSING },
      });

      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) {
        throw new BadRequestException('Workbook is empty');
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!rows.length) {
        await this.prisma.importJob.update({
          where: { id: job.id },
          data: {
            status: ImportStatus.FAILED,
            error_report: { message: 'Fichier vide ou format invalide' },
            completed_at: new Date(),
          },
        });

        return {
          job_id: job.id,
          status: ImportStatus.FAILED,
          rows_inserted: 0,
          rows_skipped: 0,
          error_report: { message: 'Fichier vide ou format invalide' },
        };
      }

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
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
          rowsSkipped += 1;
          errors.push({ row: rowNumber, error: 'INVALID_AMOUNT', value: String(amountValue ?? '') });
          continue;
        }

        const detectedLineType = parseLineType(lineTypeRaw);
        if (!detectedLineType) {
          rowsSkipped += 1;
          errors.push({ row: rowNumber, error: 'INVALID_LINE_TYPE', value: lineTypeRaw });
          continue;
        }

        const lineType = detectedLineType;
        const absoluteAmount = Math.abs(parsedAmount);

        const signedAmount = lineType === LineType.EXPENSE ? -absoluteAmount : absoluteAmount;
        const transactionDate = transactionDateRaw instanceof Date ? transactionDateRaw : new Date(String(transactionDateRaw));

        transactions.push({
          org_id: orgId,
          period_id: periodId,
          account_code: accountCode,
          account_label: label,
          department,
          amount: new Prisma.Decimal(signedAmount.toFixed(2)),
          import_job_id: job.id,
          created_at: Number.isNaN(transactionDate.getTime()) ? new Date() : transactionDate,
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
          error_report: { message: 'Erreur de traitement du fichier' },
          completed_at: new Date(),
        },
      });

      this.logger.error(`Import job ${job.id} failed`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  async upload(file: Express.Multer.File | undefined, periodId: string, currentUser: ImportsCurrentUser) {
    if (!file) {
      throw new BadRequestException('File is required');
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
}
