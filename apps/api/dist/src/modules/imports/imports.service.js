"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ImportsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const XLSX = require("xlsx");
const prisma_service_1 = require("../../prisma/prisma.service");
function normalizeHeader(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}
function readAmount(value) {
    if (typeof value === 'number') {
        return value;
    }
    const normalized = String(value ?? '')
        .replace(/\s/g, '')
        .replace(/,/g, '.')
        .replace(/[A-Za-z$€£¥₣]/g, '');
    return Number.parseFloat(normalized);
}
function parseLineType(raw) {
    const normalized = normalizeHeader(raw);
    if (['expense', 'charge', 'depense', 'cout', 'cost'].includes(normalized)) {
        return client_1.LineType.EXPENSE;
    }
    if (['revenue', 'revenu', 'produit', 'income', 'recette'].includes(normalized)) {
        return client_1.LineType.REVENUE;
    }
    return null;
}
let ImportsService = ImportsService_1 = class ImportsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ImportsService_1.name);
    }
    async processImport(file, periodId, orgId, createdBy) {
        if (!file) {
            throw new common_1.BadRequestException('File is required');
        }
        if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
            throw new common_1.BadRequestException('Only .xlsx files are supported');
        }
        if (file.size > 10 * 1024 * 1024) {
            throw new common_1.BadRequestException('File too large');
        }
        const period = await this.prisma.period.findFirst({
            where: { id: periodId, fiscal_year: { org_id: orgId } },
            select: { id: true },
        });
        if (!period) {
            throw new common_1.UnauthorizedException();
        }
        const job = await this.prisma.importJob.create({
            data: {
                org_id: orgId,
                period_id: periodId,
                created_by: createdBy,
                source: client_1.ImportSource.EXCEL,
                status: client_1.ImportStatus.PENDING,
                file_name: file.originalname,
                file_size_kb: Math.max(1, Math.round(file.size / 1024)),
                started_at: new Date(),
            },
        });
        try {
            await this.prisma.importJob.update({
                where: { id: job.id },
                data: { status: client_1.ImportStatus.PROCESSING },
            });
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
            if (!sheet) {
                throw new common_1.BadRequestException('Workbook is empty');
            }
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (!rows.length) {
                await this.prisma.importJob.update({
                    where: { id: job.id },
                    data: {
                        status: client_1.ImportStatus.FAILED,
                        error_report: { message: 'Fichier vide ou format invalide' },
                        completed_at: new Date(),
                    },
                });
                return {
                    job_id: job.id,
                    status: client_1.ImportStatus.FAILED,
                    rows_inserted: 0,
                    rows_skipped: 0,
                    error_report: { message: 'Fichier vide ou format invalide' },
                };
            }
            const transactions = [];
            let rowsSkipped = 0;
            const errors = [];
            for (let index = 0; index < rows.length; index += 1) {
                const row = rows[index];
                const rowNumber = index + 2;
                const normalized = new Map();
                Object.entries(row).forEach(([key, value]) => normalized.set(normalizeHeader(key), value));
                const accountCode = String(normalized.get('accountcode') ??
                    normalized.get('code') ??
                    normalized.get('codecomptable') ??
                    normalized.get('syscohadacode') ??
                    '').trim();
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
                const signedAmount = lineType === client_1.LineType.EXPENSE ? -absoluteAmount : absoluteAmount;
                const transactionDate = transactionDateRaw instanceof Date ? transactionDateRaw : new Date(String(transactionDateRaw));
                transactions.push({
                    org_id: orgId,
                    period_id: periodId,
                    account_code: accountCode,
                    account_label: label,
                    department,
                    amount: new client_1.Prisma.Decimal(signedAmount.toFixed(2)),
                    import_job_id: job.id,
                    created_at: Number.isNaN(transactionDate.getTime()) ? new Date() : transactionDate,
                });
            }
            if (transactions.length > 0) {
                await this.prisma.transaction.createMany({ data: transactions });
            }
            const finalStatus = transactions.length === 0 ? client_1.ImportStatus.FAILED : client_1.ImportStatus.DONE;
            const errorReport = errors.length > 0 ? JSON.parse(JSON.stringify(errors)) : client_1.Prisma.JsonNull;
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
        }
        catch (error) {
            await this.prisma.importJob.update({
                where: { id: job.id },
                data: {
                    status: client_1.ImportStatus.FAILED,
                    error_report: { message: 'Erreur de traitement du fichier' },
                    completed_at: new Date(),
                },
            });
            this.logger.error(`Import job ${job.id} failed`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async upload(file, periodId, currentUser) {
        if (!file) {
            throw new common_1.BadRequestException('File is required');
        }
        return this.processImport(file, periodId, currentUser.org_id, currentUser.sub);
    }
    async getJob(jobId, currentUser) {
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
            throw new common_1.NotFoundException();
        }
        return job;
    }
};
exports.ImportsService = ImportsService;
exports.ImportsService = ImportsService = ImportsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ImportsService);
//# sourceMappingURL=imports.service.js.map