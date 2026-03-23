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
exports.ImportsService = exports.MAX_IMPORT_FILE_SIZE_BYTES = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const ExcelJS = require("exceljs");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const audit_service_1 = require("../../common/services/audit.service");
const events_gateway_1 = require("../../common/services/events.gateway");
const prisma_service_1 = require("../../prisma/prisma.service");
const syscohada_mapping_service_1 = require("../../common/services/syscohada-mapping.service");
exports.MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMPORT_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
function importBadRequest(code, message, details) {
    return new common_1.BadRequestException({ code, message, ...(details ? { details } : {}) });
}
function isAllowedImportMimeType(mimetype) {
    return typeof mimetype === 'string' && ALLOWED_IMPORT_MIME_TYPES.has(mimetype);
}
function hasXlsxZipSignature(buffer) {
    if (buffer.length < 4) {
        return false;
    }
    const signature = buffer.subarray(0, 4).toString('hex').toUpperCase();
    return signature === '504B0304' || signature === '504B0506' || signature === '504B0708';
}
function normalizeHeader(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}
function normalizeAmountString(value) {
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
function readAmount(value) {
    const normalized = normalizeAmountString(value);
    if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) {
        return null;
    }
    try {
        return new client_1.Prisma.Decimal(normalized);
    }
    catch {
        return null;
    }
}
function buildServerFileName() {
    return `import_${(0, crypto_1.randomUUID)()}.xlsx`;
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
async function readWorkbookRows(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        return [];
    }
    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values
        .slice(1)
        .map((value) => String(value ?? '').trim());
    if (headers.every((header) => header.length === 0)) {
        return [];
    }
    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
            return;
        }
        const record = {};
        let hasValue = false;
        headers.forEach((header, index) => {
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
function normalizeWorksheetCellValue(value) {
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
        return normalizeWorksheetCellValue(value.result);
    }
    return String(value);
}
let ImportsService = ImportsService_1 = class ImportsService {
    constructor(prisma, auditService, eventsGateway, syscohadaMappingService) {
        this.prisma = prisma;
        this.auditService = auditService;
        this.eventsGateway = eventsGateway;
        this.syscohadaMappingService = syscohadaMappingService;
        this.logger = new common_1.Logger(ImportsService_1.name);
    }
    async processImport(file, periodId, orgId, createdBy, ipAddress) {
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
        if (file.size > exports.MAX_IMPORT_FILE_SIZE_BYTES) {
            throw importBadRequest('IMPORT_FILE_TOO_LARGE', 'File too large', {
                max_bytes: exports.MAX_IMPORT_FILE_SIZE_BYTES,
            });
        }
        const period = await this.prisma.period.findFirst({
            where: { id: periodId, fiscal_year: { org_id: orgId } },
            select: { id: true },
        });
        if (!period) {
            throw new common_1.UnauthorizedException({
                code: 'IMPORT_PERIOD_UNAUTHORIZED',
                message: 'The selected period is not accessible for this organization',
            });
        }
        const safeFileName = buildServerFileName();
        const job = await this.prisma.importJob.create({
            data: {
                org_id: orgId,
                period_id: periodId,
                created_by: createdBy,
                source: client_1.ImportSource.EXCEL,
                status: client_1.ImportStatus.PENDING,
                file_name: safeFileName,
                file_size_kb: Math.max(1, Math.round(file.size / 1024)),
                started_at: new Date(),
            },
        });
        await this.safeCreateAuditLog({
            org_id: orgId,
            user_id: createdBy,
            action: enums_1.AuditAction.IMPORT_START,
            entity_type: 'import_job',
            entity_id: job.id,
            ip_address: ipAddress,
            metadata: {
                source: client_1.ImportSource.EXCEL,
                file_name: safeFileName,
                file_size_kb: Math.max(1, Math.round(file.size / 1024)),
                mimetype: file.mimetype ?? null,
            },
        });
        try {
            await this.prisma.importJob.update({
                where: { id: job.id },
                data: { status: client_1.ImportStatus.PROCESSING },
            });
            this.eventsGateway.emitToOrg(orgId, 'IMPORT_PROGRESS', {
                job_id: job.id,
                progress: 10,
                status: client_1.ImportStatus.PROCESSING,
            });
            const rows = await readWorkbookRows(file.buffer);
            if (!rows.length) {
                throw importBadRequest('IMPORT_WORKBOOK_EMPTY', 'Workbook is empty');
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
                if (!parsedAmount || parsedAmount.lte(0)) {
                    rowsSkipped += 1;
                    errors.push({ row: rowNumber, error: 'INVALID_AMOUNT', value: String(amountValue ?? '') });
                    continue;
                }
                const lineTypeHint = parseLineType(lineTypeRaw);
                const resolvedLineTypeStr = await this.syscohadaMappingService.resolveSingleLineType(accountCode, parsedAmount.toString(), orgId);
                const lineType = resolvedLineTypeStr === 'REVENUE'
                    ? client_1.LineType.REVENUE
                    : resolvedLineTypeStr === 'EXPENSE'
                        ? client_1.LineType.EXPENSE
                        : lineTypeHint;
                if (!lineType) {
                    rowsSkipped += 1;
                    errors.push({ row: rowNumber, error: 'INVALID_LINE_TYPE', value: lineTypeRaw });
                    continue;
                }
                const absoluteAmount = parsedAmount.abs();
                const signedAmount = lineType === client_1.LineType.EXPENSE ? absoluteAmount.negated() : absoluteAmount;
                const transactionDate = transactionDateRaw instanceof Date ? transactionDateRaw : new Date(String(transactionDateRaw));
                transactions.push({
                    org_id: orgId,
                    period_id: periodId,
                    account_code: accountCode,
                    account_label: label,
                    department,
                    amount: signedAmount.toDecimalPlaces(2),
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
            await this.safeCreateAuditLog({
                org_id: orgId,
                user_id: createdBy,
                action: enums_1.AuditAction.IMPORT_DONE,
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
        }
        catch (error) {
            await this.prisma.importJob.update({
                where: { id: job.id },
                data: {
                    status: client_1.ImportStatus.FAILED,
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
                action: enums_1.AuditAction.IMPORT_DONE,
                entity_type: 'import_job',
                entity_id: job.id,
                ip_address: ipAddress,
                metadata: {
                    status: client_1.ImportStatus.FAILED,
                    error_code: error instanceof common_1.BadRequestException ? 'IMPORT_PROCESSING_FAILED' : 'IMPORT_PROCESSING_FAILED',
                },
            });
            this.eventsGateway.emitToOrg(orgId, 'IMPORT_DONE', {
                job_id: job.id,
                inserted: 0,
                skipped: 0,
                status: client_1.ImportStatus.FAILED,
            });
            this.logger.error(`Import job ${job.id} failed`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async upload(file, periodId, currentUser) {
        if (!file) {
            throw importBadRequest('IMPORT_FILE_REQUIRED', 'File is required');
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
    async safeCreateAuditLog(params) {
        try {
            await this.auditService.createLog(params);
        }
        catch (error) {
            this.logger.warn(`Failed to persist audit log ${params.action} for ${params.entity_type}:${params.entity_id ?? 'n/a'}`);
            this.logger.debug(error instanceof Error ? error.message : 'Unknown audit log error');
        }
    }
};
exports.ImportsService = ImportsService;
exports.ImportsService = ImportsService = ImportsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        events_gateway_1.EventsGateway,
        syscohada_mapping_service_1.SyscohadaMappingService])
], ImportsService);
//# sourceMappingURL=imports.service.js.map