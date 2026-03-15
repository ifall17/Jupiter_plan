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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionsController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const org_guard_1 = require("../../common/guards/org.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const create_transaction_dto_1 = require("./dto/create-transaction.dto");
const validate_batch_dto_1 = require("./dto/validate-batch.dto");
const transactions_service_1 = require("./transactions.service");
let TransactionsController = class TransactionsController {
    constructor(transactionsService) {
        this.transactionsService = transactionsService;
    }
    async list(req, periodId, department, lineType, page, limit) {
        return this.transactionsService.list({
            currentUser: this.getCurrentUser(req),
            period_id: periodId,
            department,
            line_type: lineType,
            page: this.parsePositiveInt(page),
            limit: this.parsePositiveInt(limit),
        });
    }
    async create(req, dto) {
        return this.transactionsService.create(this.getCurrentUser(req), dto);
    }
    async validateBatch(req, dto) {
        return this.transactionsService.validateBatch(this.getCurrentUser(req), dto.ids);
    }
    getCurrentUser(req) {
        const user = req.user;
        if (!user?.sub || !user.org_id) {
            throw new common_1.UnauthorizedException();
        }
        return user;
    }
    parsePositiveInt(value) {
        if (!value)
            return undefined;
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
    }
};
exports.TransactionsController = TransactionsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.UserRole.SUPER_ADMIN, client_1.UserRole.FPA, client_1.UserRole.CONTRIBUTEUR, client_1.UserRole.LECTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('period_id')),
    __param(2, (0, common_1.Query)('department')),
    __param(3, (0, common_1.Query)('line_type')),
    __param(4, (0, common_1.Query)('page')),
    __param(5, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], TransactionsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.UserRole.SUPER_ADMIN, client_1.UserRole.FPA, client_1.UserRole.CONTRIBUTEUR),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_transaction_dto_1.CreateTransactionDto]),
    __metadata("design:returntype", Promise)
], TransactionsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('validate-batch'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.SUPER_ADMIN, client_1.UserRole.FPA),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, org_guard_1.OrgGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, validate_batch_dto_1.ValidateBatchDto]),
    __metadata("design:returntype", Promise)
], TransactionsController.prototype, "validateBatch", null);
exports.TransactionsController = TransactionsController = __decorate([
    (0, common_1.Controller)('transactions'),
    __metadata("design:paramtypes", [transactions_service_1.TransactionsService])
], TransactionsController);
//# sourceMappingURL=transactions.controller.js.map