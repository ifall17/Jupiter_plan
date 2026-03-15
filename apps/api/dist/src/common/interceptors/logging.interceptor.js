"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LoggingInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggingInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
let LoggingInterceptor = LoggingInterceptor_1 = class LoggingInterceptor {
    constructor() {
        this.logger = new common_1.Logger(LoggingInterceptor_1.name);
    }
    intercept(context, next) {
        const http = context.switchToHttp();
        const request = http.getRequest();
        const response = http.getResponse();
        const startedAt = Date.now();
        const userId = request.user?.sub ?? 'anonymous';
        const orgId = request.user?.org_id ?? null;
        const ipAddress = request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            request.ip ||
            'unknown';
        this.logger.log({
            timestamp: new Date().toISOString(),
            event_type: 'http.request',
            method: request.method,
            path: request.originalUrl || request.url,
            user_id: userId,
            org_id: orgId,
            ip_address: ipAddress,
        });
        return next.handle().pipe((0, operators_1.tap)(() => {
            this.logger.log({
                timestamp: new Date().toISOString(),
                event_type: 'http.response',
                method: request.method,
                path: request.originalUrl || request.url,
                status_code: response.statusCode,
                duration_ms: Date.now() - startedAt,
                user_id: userId,
            });
        }));
    }
};
exports.LoggingInterceptor = LoggingInterceptor;
exports.LoggingInterceptor = LoggingInterceptor = LoggingInterceptor_1 = __decorate([
    (0, common_1.Injectable)()
], LoggingInterceptor);
//# sourceMappingURL=logging.interceptor.js.map