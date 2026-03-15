"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
let JwtAuthGuard = class JwtAuthGuard extends (0, passport_1.AuthGuard)('jwt') {
    async canActivate(context) {
        try {
            const canActivate = (await super.canActivate(context));
            if (!canActivate) {
                throw new common_1.UnauthorizedException();
            }
            const request = context.switchToHttp().getRequest();
            const authHeader = request.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                throw new common_1.UnauthorizedException();
            }
            const token = authHeader.slice('Bearer '.length).trim();
            const segments = token.split('.');
            if (segments.length !== 3) {
                throw new common_1.UnauthorizedException();
            }
            const headerJson = Buffer.from(segments[0], 'base64url').toString('utf8');
            const header = JSON.parse(headerJson);
            if (header.alg !== 'HS256') {
                throw new common_1.UnauthorizedException();
            }
            if (!request.user?.exp) {
                throw new common_1.UnauthorizedException();
            }
            return true;
        }
        catch {
            throw new common_1.UnauthorizedException();
        }
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)()
], JwtAuthGuard);
//# sourceMappingURL=jwt-auth.guard.js.map