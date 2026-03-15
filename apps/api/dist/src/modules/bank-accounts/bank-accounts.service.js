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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BankAccountsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const enums_1 = require("../../shared/enums");
const prisma_service_1 = require("../../prisma/prisma.service");
const audit_service_1 = require("../../common/services/audit.service");
let BankAccountsService = class BankAccountsService {
    constructor(prisma, auditService) {
        this.prisma = prisma;
        this.auditService = auditService;
    }
    async listActive(currentUser) {
        const rows = await this.prisma.bankAccount.findMany({
            where: { org_id: currentUser.org_id, is_active: true },
            orderBy: { created_at: 'desc' },
        });
        return rows.map((row) => this.toResponse(row));
    }
    async create(currentUser, dto) {
        const row = await this.prisma.bankAccount.create({
            data: {
                org_id: currentUser.org_id,
                name: dto.name.trim(),
                account_type: dto.account_type,
                balance: new client_1.Prisma.Decimal(dto.balance),
                currency: dto.currency?.trim() || 'XOF',
            },
        });
        return this.toResponse(row);
    }
    async updateBalance(currentUser, id, balance, ipAddress) {
        try {
            new client_1.Prisma.Decimal(balance);
        }
        catch {
            throw new common_1.BadRequestException({ code: 'INVALID_AMOUNT', message: 'Invalid decimal amount.' });
        }
        const existing = await this.prisma.bankAccount.findFirst({
            where: { id, org_id: currentUser.org_id },
        });
        if (!existing) {
            throw new common_1.NotFoundException();
        }
        const row = await this.prisma.bankAccount.update({
            where: { id: existing.id },
            data: { balance: new client_1.Prisma.Decimal(balance) },
        });
        await this.auditService.createLog({
            org_id: currentUser.org_id,
            user_id: currentUser.sub,
            action: enums_1.AuditAction.BALANCE_UPDATE,
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
    toResponse(row) {
        return {
            id: row.id,
            name: row.name,
            account_type: row.account_type,
            balance: row.balance.toString(),
            currency: row.currency,
            is_active: row.is_active,
        };
    }
};
exports.BankAccountsService = BankAccountsService;
exports.BankAccountsService = BankAccountsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], BankAccountsService);
//# sourceMappingURL=bank-accounts.service.js.map