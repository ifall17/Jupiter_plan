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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const argon2 = require("argon2");
const auth_repository_1 = require("./auth.repository");
const enums_1 = require("../../shared/enums");
const redis_service_1 = require("../../redis/redis.service");
const AUTH_ERROR_CODES = {
    INVALID_CREDENTIALS: 'AUTH_001',
    ACCOUNT_LOCKED: 'AUTH_002',
    TOKEN_EXPIRED: 'AUTH_003',
};
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_ATTEMPTS_TTL_SECONDS = 15 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
let AuthService = AuthService_1 = class AuthService {
    get accessTokenTtl() {
        return this.configService.get('JWT_ACCESS_EXPIRY') ?? '8h';
    }
    get refreshTokenTtl() {
        return this.configService.get('JWT_REFRESH_EXPIRY') ?? '30d';
    }
    constructor(authRepository, jwtService, configService, redisService) {
        this.authRepository = authRepository;
        this.jwtService = jwtService;
        this.configService = configService;
        this.redisService = redisService;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async login(dto, ipAddress) {
        const email = dto.email.trim().toLowerCase();
        const attempts = await this.getLoginAttempts(email);
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
            this.logSecurityEvent('AUTH_LOGIN_BLOCKED', {
                org_id: 'unknown',
                user_id: 'unknown',
                ip_address: ipAddress,
                outcome: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            });
            throw new common_1.UnauthorizedException({
                code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
                message: 'Account temporarily locked.',
            });
        }
        const user = await this.authRepository.findUserByEmailForAuth(email);
        if (!user) {
            await this.registerFailedLogin(email, ipAddress);
            throw new common_1.UnauthorizedException({
                code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
                message: 'Invalid credentials.',
            });
        }
        if (!user.is_active) {
            throw new common_1.UnauthorizedException({
                code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
                message: 'Account temporarily locked.',
            });
        }
        const isPasswordValid = await argon2.verify(user.password_hash, dto.password);
        if (!isPasswordValid) {
            await this.registerFailedLogin(email, ipAddress, user.id, user.org_id);
            throw new common_1.UnauthorizedException({
                code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
                message: 'Invalid credentials.',
            });
        }
        await this.clearLoginAttempts(email);
        const tokenPayload = {
            sub: user.id,
            org_id: user.org_id,
            role: user.role,
            email: user.email,
            department_scope: user.department_scopes,
        };
        const [access_token, refresh_token] = await Promise.all([
            this.jwtService.signAsync(tokenPayload, {
                secret: this.configService.get('JWT_SECRET'),
                algorithm: 'HS256',
                expiresIn: this.accessTokenTtl,
            }),
            this.jwtService.signAsync(tokenPayload, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
                algorithm: 'HS256',
                expiresIn: this.refreshTokenTtl,
            }),
        ]);
        await this.storeRefreshToken(user.id, refresh_token);
        await this.authRepository.updateLastLoginAt(user.id, new Date());
        await this.authRepository.createAuditLog({
            org_id: user.org_id,
            user_id: user.id,
            action: enums_1.AuditAction.LOGIN,
            entity_type: 'auth',
            entity_id: user.id,
            ip_address: ipAddress,
            metadata: { event_type: 'LOGIN' },
        });
        this.logSecurityEvent('AUTH_LOGIN_SUCCESS', {
            user_id: user.id,
            org_id: user.org_id,
            ip_address: ipAddress,
            outcome: 'SUCCESS',
            token_prefix: this.maskToken(access_token),
        });
        return {
            access_token,
            refresh_token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                org_id: user.org_id,
                first_name: user.first_name,
                last_name: user.last_name,
            },
        };
    }
    async refresh(refreshToken) {
        let payload;
        try {
            payload = await this.jwtService.verifyAsync(refreshToken, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
                algorithms: ['HS256'],
            });
        }
        catch {
            throw new common_1.UnauthorizedException({
                code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
                message: 'Token expired or invalid.',
            });
        }
        if (!payload?.exp) {
            throw new common_1.UnauthorizedException({
                code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
                message: 'Token expired or invalid.',
            });
        }
        const redisKey = this.getRefreshKey(payload.sub);
        let storedHash = null;
        try {
            storedHash = await this.redisService.get(redisKey);
        }
        catch (error) {
            this.logSecurityEvent('AUTH_REDIS_ERROR', {
                user_id: payload.sub,
                org_id: payload.org_id,
                outcome: 'REDIS_FAILURE',
            });
            throw new common_1.InternalServerErrorException('Authentication unavailable.');
        }
        if (!storedHash) {
            throw new common_1.UnauthorizedException({
                code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
                message: 'Token expired or invalid.',
            });
        }
        const isRefreshValid = await argon2.verify(storedHash, refreshToken);
        if (!isRefreshValid) {
            throw new common_1.UnauthorizedException({
                code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
                message: 'Token expired or invalid.',
            });
        }
        const newPayload = {
            sub: payload.sub,
            org_id: payload.org_id,
            role: payload.role,
            email: payload.email,
            department_scope: payload.department_scope,
        };
        const [access_token, refresh_token] = await Promise.all([
            this.jwtService.signAsync(newPayload, {
                secret: this.configService.get('JWT_SECRET'),
                algorithm: 'HS256',
                expiresIn: this.accessTokenTtl,
            }),
            this.jwtService.signAsync(newPayload, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
                algorithm: 'HS256',
                expiresIn: this.refreshTokenTtl,
            }),
        ]);
        try {
            const hashedRefreshToken = await argon2.hash(refresh_token, { type: argon2.argon2id });
            await this.redisService.set(redisKey, hashedRefreshToken, 'EX', REFRESH_TTL_SECONDS);
        }
        catch {
            throw new common_1.InternalServerErrorException('Authentication unavailable.');
        }
        this.logSecurityEvent('AUTH_REFRESH_SUCCESS', {
            user_id: payload.sub,
            org_id: payload.org_id,
            outcome: 'SUCCESS',
            token_prefix: this.maskToken(access_token),
        });
        const userProfile = await this.authRepository.findUserProfileById(payload.sub, payload.org_id);
        if (!userProfile) {
            throw new common_1.UnauthorizedException({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS, message: 'User not found.' });
        }
        return {
            access_token,
            refresh_token,
            user: {
                id: userProfile.id,
                email: userProfile.email,
                role: userProfile.role,
                org_id: userProfile.org_id,
                first_name: userProfile.first_name,
                last_name: userProfile.last_name,
            },
        };
    }
    async logout(payload, ipAddress) {
        const redisKey = this.getRefreshKey(payload.sub);
        try {
            const deleted = await this.redisService.del(redisKey);
            this.logSecurityEvent('AUTH_LOGOUT_REDIS', {
                user_id: payload.sub,
                org_id: payload.org_id,
                outcome: deleted > 0 ? 'SESSION_INVALIDATED' : 'SESSION_ALREADY_INVALID',
            });
        }
        catch {
            throw new common_1.InternalServerErrorException('Authentication unavailable.');
        }
        await this.authRepository.createAuditLog({
            org_id: payload.org_id,
            user_id: payload.sub,
            action: enums_1.AuditAction.LOGOUT,
            entity_type: 'auth',
            entity_id: payload.sub,
            ip_address: ipAddress,
            metadata: { event_type: 'LOGOUT' },
        });
        this.logSecurityEvent('AUTH_LOGOUT', {
            user_id: payload.sub,
            org_id: payload.org_id,
            ip_address: ipAddress,
            outcome: 'SUCCESS',
        });
        return { success: true };
    }
    async me(payload) {
        const user = await this.authRepository.findUserProfileById(payload.sub, payload.org_id);
        if (!user) {
            throw new common_1.UnauthorizedException({
                code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
                message: 'Invalid credentials.',
            });
        }
        return user;
    }
    async validateUserCredentials(email, password) {
        const user = await this.authRepository.findUserByEmailForAuth(email.trim().toLowerCase());
        if (!user || !user.is_active) {
            return null;
        }
        const valid = await argon2.verify(user.password_hash, password);
        if (!valid) {
            return null;
        }
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            org_id: user.org_id,
            department_scope: user.department_scopes,
            first_name: user.first_name,
            last_name: user.last_name,
            last_login_at: user.last_login_at,
        };
    }
    async storeRefreshToken(userId, refreshToken) {
        const redisKey = this.getRefreshKey(userId);
        const hashedRefreshToken = await argon2.hash(refreshToken, { type: argon2.argon2id });
        try {
            await this.redisService.set(redisKey, hashedRefreshToken, 'EX', REFRESH_TTL_SECONDS);
        }
        catch {
            throw new common_1.InternalServerErrorException('Authentication unavailable.');
        }
    }
    async getLoginAttempts(email) {
        try {
            const raw = await this.redisService.get(this.getLoginAttemptKey(email));
            return raw ? Number.parseInt(raw, 10) : 0;
        }
        catch {
            this.logSecurityEvent('AUTH_REDIS_READ_FAILURE', {
                user_id: 'unknown',
                org_id: 'unknown',
                outcome: 'AUTH_LOCKDOWN_DUE_TO_REDIS_FAILURE',
            });
            throw new common_1.InternalServerErrorException('Authentication unavailable.');
        }
    }
    async registerFailedLogin(email, ipAddress, userId, orgId) {
        const key = this.getLoginAttemptKey(email);
        try {
            const attempts = await this.redisService.incr(key);
            await this.redisService.expire(key, LOGIN_ATTEMPTS_TTL_SECONDS);
            this.logSecurityEvent('AUTH_LOGIN_FAILURE', {
                user_id: userId ?? 'unknown',
                org_id: orgId ?? 'unknown',
                ip_address: ipAddress,
                outcome: attempts >= MAX_LOGIN_ATTEMPTS ? AUTH_ERROR_CODES.ACCOUNT_LOCKED : AUTH_ERROR_CODES.INVALID_CREDENTIALS,
            });
            if (attempts >= MAX_LOGIN_ATTEMPTS) {
                throw new common_1.UnauthorizedException({
                    code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
                    message: 'Account temporarily locked.',
                });
            }
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            throw new common_1.InternalServerErrorException('Authentication unavailable.');
        }
    }
    async clearLoginAttempts(email) {
        try {
            await this.redisService.del(this.getLoginAttemptKey(email));
        }
        catch {
            throw new common_1.InternalServerErrorException('Authentication unavailable.');
        }
    }
    getRefreshKey(userId) {
        return `refresh:${userId}`;
    }
    getLoginAttemptKey(email) {
        return `login_attempts:${email}`;
    }
    maskToken(token) {
        return token.slice(0, 8);
    }
    logSecurityEvent(eventType, payload) {
        this.logger.log({
            timestamp: new Date().toISOString(),
            event_type: eventType,
            ...payload,
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_repository_1.AuthRepository,
        jwt_1.JwtService,
        config_1.ConfigService,
        redis_service_1.RedisService])
], AuthService);
//# sourceMappingURL=auth.service.js.map