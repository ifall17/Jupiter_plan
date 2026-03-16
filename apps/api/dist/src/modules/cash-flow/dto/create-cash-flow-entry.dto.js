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
exports.CreateCashFlowEntryDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateCashFlowEntryDto {
}
exports.CreateCashFlowEntryDto = CreateCashFlowEntryDto;
__decorate([
    (0, class_validator_1.IsIn)([
        'ENCAISSEMENT_CLIENT',
        'DECAISSEMENT_FOURNISSEUR',
        'SALAIRES',
        'IMPOTS_TAXES',
        'INVESTISSEMENT',
        'FINANCEMENT',
        'AUTRE_ENTREE',
        'AUTRE_SORTIE',
    ]),
    __metadata("design:type", String)
], CreateCashFlowEntryDto.prototype, "flow_type", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateCashFlowEntryDto.prototype, "label", void 0);
__decorate([
    (0, class_validator_1.IsDecimal)(),
    __metadata("design:type", String)
], CreateCashFlowEntryDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateCashFlowEntryDto.prototype, "planned_date", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['IN', 'OUT']),
    __metadata("design:type", String)
], CreateCashFlowEntryDto.prototype, "direction", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateCashFlowEntryDto.prototype, "bank_account_id", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], CreateCashFlowEntryDto.prototype, "notes", void 0);
//# sourceMappingURL=create-cash-flow-entry.dto.js.map