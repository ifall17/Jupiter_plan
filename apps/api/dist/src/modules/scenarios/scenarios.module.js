"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScenariosModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const scenarios_controller_1 = require("./scenarios.controller");
const scenarios_service_1 = require("./scenarios.service");
const scenarios_repository_1 = require("./scenarios.repository");
const prisma_service_1 = require("../../prisma/prisma.service");
const audit_service_1 = require("../../common/services/audit.service");
let ScenariosModule = class ScenariosModule {
};
exports.ScenariosModule = ScenariosModule;
exports.ScenariosModule = ScenariosModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({
                name: 'calc-queue',
            }),
        ],
        controllers: [scenarios_controller_1.ScenariosController],
        providers: [scenarios_service_1.ScenariosService, scenarios_repository_1.ScenariosRepository, prisma_service_1.PrismaService, audit_service_1.AuditService],
        exports: [scenarios_service_1.ScenariosService],
    })
], ScenariosModule);
//# sourceMappingURL=scenarios.module.js.map