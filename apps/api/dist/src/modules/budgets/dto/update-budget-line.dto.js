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
exports.UpdateBudgetLineDto = exports.BudgetLineDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const client_1 = require("@prisma/client");
class BudgetLineDto {
}
exports.BudgetLineDto = BudgetLineDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BudgetLineDto.prototype, "id", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], BudgetLineDto.prototype, "period_id", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{6,8}$/),
    __metadata("design:type", String)
], BudgetLineDto.prototype, "account_code", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], BudgetLineDto.prototype, "account_label", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], BudgetLineDto.prototype, "department", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.LineType),
    __metadata("design:type", String)
], BudgetLineDto.prototype, "line_type", void 0);
__decorate([
    (0, class_validator_1.IsDecimal)(),
    __metadata("design:type", String)
], BudgetLineDto.prototype, "amount_budget", void 0);
class UpdateBudgetLineDto {
}
exports.UpdateBudgetLineDto = UpdateBudgetLineDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => BudgetLineDto),
    __metadata("design:type", Array)
], UpdateBudgetLineDto.prototype, "lines", void 0);
//# sourceMappingURL=update-budget-line.dto.js.map