"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportsModule = void 0;
const common_1 = require("@nestjs/common");
const realtime_module_1 = require("../../common/realtime.module");
const audit_service_1 = require("../../common/services/audit.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const syscohada_mapping_service_1 = require("../../common/services/syscohada-mapping.service");
const imports_controller_1 = require("./imports.controller");
const imports_service_1 = require("./imports.service");
let ImportsModule = class ImportsModule {
};
exports.ImportsModule = ImportsModule;
exports.ImportsModule = ImportsModule = __decorate([
    (0, common_1.Module)({
        imports: [realtime_module_1.RealtimeModule],
        controllers: [imports_controller_1.ImportsController],
        providers: [imports_service_1.ImportsService, prisma_service_1.PrismaService, audit_service_1.AuditService, syscohada_mapping_service_1.SyscohadaMappingService],
    })
], ImportsModule);
//# sourceMappingURL=imports.module.js.map