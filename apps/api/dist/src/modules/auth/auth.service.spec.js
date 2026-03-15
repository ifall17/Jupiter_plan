"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const argon2 = require("argon2");
const auth_service_1 = require("./auth.service");
const enums_1 = require("../../shared/enums");
jest.mock('argon2', () => ({
    hash: jest.fn(),
    verify: jest.fn(),
    argon2id: 2,
}));
describe('AuthService', () => {
    let service;
    let authRepository;
    let redisService;
    let jwtService;
    let configService;
    const baseUser = {
        id: 'user-1',
        org_id: 'org-1',
        email: 'admin@diallo.sn',
        password_hash: 'hash',
        first_name: 'Mamadou',
        last_name: 'Diallo',
        role: enums_1.UserRole.SUPER_ADMIN,
        is_active: true,
        last_login_at: null,
        department_scopes: [],
    };
    beforeEach(() => {
        authRepository = {
            findUserByEmailForAuth: jest.fn(),
            findUserProfileById: jest.fn(),
            updateLastLoginAt: jest.fn(),
            createAuditLog: jest.fn(),
        };
        redisService = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            incr: jest.fn(),
            expire: jest.fn(),
        };
        jwtService = {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
        };
        configService = {
            get: jest.fn((key) => {
                if (key === 'JWT_SECRET')
                    return 'secret';
                if (key === 'JWT_REFRESH_SECRET')
                    return 'refresh-secret';
                return undefined;
            }),
        };
        service = new auth_service_1.AuthService(authRepository, jwtService, configService, redisService);
    });
    it('should return tokens when credentials are valid', async () => {
        authRepository.findUserByEmailForAuth.mockResolvedValue(baseUser);
        redisService.get.mockResolvedValue(null);
        argon2.verify.mockResolvedValue(true);
        argon2.hash.mockResolvedValue('hashed-refresh');
        jwtService.signAsync
            .mockResolvedValueOnce('access-token')
            .mockResolvedValueOnce('refresh-token');
        const result = await service.login({ email: baseUser.email, password: 'ValidPassword1!' }, '127.0.0.1');
        expect(result.access_token).toBe('access-token');
        expect(result.refresh_token).toBe('refresh-token');
        expect(result.user.email).toBe(baseUser.email);
        expect(result.user).not.toHaveProperty('password_hash');
    });
    it('should throw INVALID_CREDENTIALS when email does not exist', async () => {
        authRepository.findUserByEmailForAuth.mockResolvedValue(null);
        redisService.get.mockResolvedValue('0');
        redisService.incr.mockResolvedValue(1);
        const act = service.login({ email: 'unknown@diallo.sn', password: 'ValidPassword1!' }, '127.0.0.1');
        await expect(act).rejects.toThrow(common_1.UnauthorizedException);
    });
    it('should throw INVALID_CREDENTIALS when password is incorrect', async () => {
        authRepository.findUserByEmailForAuth.mockResolvedValue(baseUser);
        redisService.get.mockResolvedValue('0');
        redisService.incr.mockResolvedValue(1);
        argon2.verify.mockResolvedValue(false);
        const act = service.login({ email: baseUser.email, password: 'WrongPassword1!' }, '127.0.0.1');
        await expect(act).rejects.toThrow(common_1.UnauthorizedException);
    });
    it('should throw ACCOUNT_LOCKED when user is inactive', async () => {
        authRepository.findUserByEmailForAuth.mockResolvedValue({ ...baseUser, is_active: false });
        redisService.get.mockResolvedValue('0');
        const act = service.login({ email: baseUser.email, password: 'ValidPassword1!' }, '127.0.0.1');
        await expect(act).rejects.toThrow(common_1.UnauthorizedException);
    });
    it('should throw TOKEN_EXPIRED when refresh_token is not in Redis', async () => {
        jwtService.verifyAsync.mockResolvedValue({
            sub: 'user-1',
            org_id: 'org-1',
            role: enums_1.UserRole.SUPER_ADMIN,
            email: baseUser.email,
            iat: 1,
            exp: 999999,
        });
        redisService.get.mockResolvedValue(null);
        const act = service.refresh('refresh-token');
        await expect(act).rejects.toThrow(common_1.UnauthorizedException);
    });
    it('should lock account after 5 failed login attempts', async () => {
        redisService.get.mockResolvedValue('4');
        authRepository.findUserByEmailForAuth.mockResolvedValue(baseUser);
        redisService.incr.mockResolvedValue(5);
        argon2.verify.mockResolvedValue(false);
        const act = service.login({ email: baseUser.email, password: 'WrongPassword1!' }, '127.0.0.1');
        await expect(act).rejects.toThrow(common_1.UnauthorizedException);
    });
    it('should delete Redis key when logout is called', async () => {
        redisService.del.mockResolvedValue(1);
        const result = await service.logout({
            sub: 'user-1',
            org_id: 'org-1',
            role: enums_1.UserRole.SUPER_ADMIN,
            email: baseUser.email,
            iat: 1,
            exp: 2,
        }, '127.0.0.1');
        expect(redisService.del).toHaveBeenCalledWith('refresh:user-1');
        expect(result).toEqual({ success: true });
    });
    it('should never return password_hash in any response', async () => {
        authRepository.findUserProfileById.mockResolvedValue({
            id: 'user-1',
            email: 'admin@diallo.sn',
            role: enums_1.UserRole.SUPER_ADMIN,
            org_id: 'org-1',
            first_name: 'Mamadou',
            last_name: 'Diallo',
            last_login_at: null,
        });
        const result = await service.me({
            sub: 'user-1',
            org_id: 'org-1',
            role: enums_1.UserRole.SUPER_ADMIN,
            email: 'admin@diallo.sn',
            iat: 1,
            exp: 2,
        });
        expect(result).not.toHaveProperty('password_hash');
    });
});
//# sourceMappingURL=auth.service.spec.js.map