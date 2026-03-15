"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashFlowModule = void 0;
const common_1 = require("@nestjs/common");
const cash_flow_controller_1 = require("./cash-flow.controller");
const cash_flow_service_1 = require("./cash-flow.service");
const cash_flow_repository_1 = require("./cash-flow.repository");
const prisma_service_1 = require("../../prisma/prisma.service");
let CashFlowModule = class CashFlowModule {
};
exports.CashFlowModule = CashFlowModule;
exports.CashFlowModule = CashFlowModule = __decorate([
    (0, common_1.Module)({
        controllers: [cash_flow_controller_1.CashFlowController],
        providers: [cash_flow_service_1.CashFlowService, cash_flow_repository_1.CashFlowRepository, prisma_service_1.PrismaService],
        exports: [cash_flow_service_1.CashFlowService],
    })
], CashFlowModule);
//# sourceMappingURL=cash-flow.module.js.map