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
exports.AlertsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
let AlertsService = class AlertsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listAlerts(params) {
        const page = params.page && params.page > 0 ? params.page : 1;
        const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
        const skip = (page - 1) * limit;
        const where = {
            org_id: params.currentUser.org_id,
            ...(typeof params.is_read === 'boolean' ? { is_read: params.is_read } : {}),
            ...(params.severity ? { severity: params.severity } : {}),
            ...(params.period_id ? { period_id: params.period_id } : {}),
        };
        const [alerts, total] = await this.prisma.$transaction([
            this.prisma.alert.findMany({
                where,
                include: { kpi: true },
                skip,
                take: limit,
            }),
            this.prisma.alert.count({ where }),
        ]);
        const sorted = alerts.sort((a, b) => {
            const severityDiff = this.getSeverityRank(b.severity) - this.getSeverityRank(a.severity);
            if (severityDiff !== 0) {
                return severityDiff;
            }
            return b.created_at.getTime() - a.created_at.getTime();
        });
        return {
            data: sorted.map((alert) => ({
                id: alert.id,
                kpi_id: alert.kpi_id,
                kpi_code: alert.kpi.code,
                kpi_label: alert.kpi.label,
                period_id: alert.period_id,
                severity: alert.severity,
                message: alert.message,
                is_read: alert.is_read,
                created_at: alert.created_at,
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async markAsRead(currentUser, alertId) {
        await this.prisma.alert.updateMany({
            where: {
                id: alertId,
                org_id: currentUser.org_id,
            },
            data: { is_read: true },
        });
        return { success: true };
    }
    async markAllAsRead(currentUser) {
        const result = await this.prisma.alert.updateMany({
            where: {
                org_id: currentUser.org_id,
                is_read: false,
            },
            data: { is_read: true },
        });
        return { updated: result.count };
    }
    getSeverityRank(severity) {
        if (severity === client_1.AlertSeverity.CRITICAL) {
            return 3;
        }
        if (severity === client_1.AlertSeverity.WARN) {
            return 2;
        }
        return 1;
    }
};
exports.AlertsService = AlertsService;
exports.AlertsService = AlertsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AlertsService);
//# sourceMappingURL=alerts.service.js.map