"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtThrottlerGuard = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
let JwtThrottlerGuard = class JwtThrottlerGuard extends throttler_1.ThrottlerGuard {
    async getTracker(req) {
        const userId = req.user?.sub;
        if (userId) {
            return `jwt:${userId}`;
        }
        const forwardedFor = req.headers['x-forwarded-for'];
        const ipFromHeader = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : forwardedFor?.split(',')[0]?.trim();
        return ipFromHeader || req.ip || 'anonymous';
    }
    getRequestResponse(context) {
        const http = context.switchToHttp();
        return { req: http.getRequest(), res: http.getResponse() };
    }
};
exports.JwtThrottlerGuard = JwtThrottlerGuard;
exports.JwtThrottlerGuard = JwtThrottlerGuard = __decorate([
    (0, common_1.Injectable)()
], JwtThrottlerGuard);
//# sourceMappingURL=jwt-throttler.guard.js.map