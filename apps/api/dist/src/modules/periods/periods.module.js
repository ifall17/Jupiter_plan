"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeriodsModule = void 0;
const common_1 = require("@nestjs/common");
const calc_engine_client_1 = require("../../common/services/calc-engine.client");
const syscohada_mapping_service_1 = require("../../common/services/syscohada-mapping.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const periods_controller_1 = require("./periods.controller");
const periods_service_1 = require("./periods.service");
let PeriodsModule = class PeriodsModule {
};
exports.PeriodsModule = PeriodsModule;
exports.PeriodsModule = PeriodsModule = __decorate([
    (0, common_1.Module)({
        controllers: [periods_controller_1.PeriodsController],
        providers: [periods_service_1.PeriodsService, prisma_service_1.PrismaService, calc_engine_client_1.CalcEngineClient, syscohada_mapping_service_1.SyscohadaMappingService],
    })
], PeriodsModule);
//# sourceMappingURL=periods.module.js.map