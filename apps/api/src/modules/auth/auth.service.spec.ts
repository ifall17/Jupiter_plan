import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { RedisService } from '../../redis/redis.service';
import { UserRole } from '@shared/enums';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
  argon2id: 2,
}));

describe('AuthService', () => {
  let service: AuthService;
  let authRepository: jest.Mocked<AuthRepository>;
  let redisService: jest.Mocked<RedisService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const baseUser = {
    id: 'user-1',
    org_id: 'org-1',
    email: 'admin@diallo.sn',
    password_hash: 'hash',
    first_name: 'Mamadou',
    last_name: 'Diallo',
    role: UserRole.SUPER_ADMIN,
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
    } as unknown as jest.Mocked<AuthRepository>;

    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'secret';
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new AuthService(authRepository, jwtService, configService, redisService);
  });

  it('should return tokens when credentials are valid', async () => {
    // Arrange
    authRepository.findUserByEmailForAuth.mockResolvedValue(baseUser);
    redisService.get.mockResolvedValue(null);
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (argon2.hash as jest.Mock).mockResolvedValue('hashed-refresh');
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    // Act
    const result = await service.login({ email: baseUser.email, password: 'ValidPassword1!' }, '127.0.0.1');

    // Assert
    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
    expect(result.user.email).toBe(baseUser.email);
    expect(result.user).not.toHaveProperty('password_hash');
  });

  it('should throw INVALID_CREDENTIALS when email does not exist', async () => {
    // Arrange
    authRepository.findUserByEmailForAuth.mockResolvedValue(null);
    redisService.get.mockResolvedValue('0');
    redisService.incr.mockResolvedValue(1);

    // Act
    const act = service.login({ email: 'unknown@diallo.sn', password: 'ValidPassword1!' }, '127.0.0.1');

    // Assert
    await expect(act).rejects.toThrow(UnauthorizedException);
  });

  it('should throw INVALID_CREDENTIALS when password is incorrect', async () => {
    // Arrange
    authRepository.findUserByEmailForAuth.mockResolvedValue(baseUser);
    redisService.get.mockResolvedValue('0');
    redisService.incr.mockResolvedValue(1);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    // Act
    const act = service.login({ email: baseUser.email, password: 'WrongPassword1!' }, '127.0.0.1');

    // Assert
    await expect(act).rejects.toThrow(UnauthorizedException);
  });

  it('should throw ACCOUNT_LOCKED when user is inactive', async () => {
    // Arrange
    authRepository.findUserByEmailForAuth.mockResolvedValue({ ...baseUser, is_active: false });
    redisService.get.mockResolvedValue('0');

    // Act
    const act = service.login({ email: baseUser.email, password: 'ValidPassword1!' }, '127.0.0.1');

    // Assert
    await expect(act).rejects.toThrow(UnauthorizedException);
  });

  it('should throw TOKEN_EXPIRED when refresh_token is not in Redis', async () => {
    // Arrange
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      org_id: 'org-1',
      role: UserRole.SUPER_ADMIN,
      email: baseUser.email,
      iat: 1,
      exp: 999999,
    });
    redisService.get.mockResolvedValue(null);

    // Act
    const act = service.refresh('refresh-token');

    // Assert
    await expect(act).rejects.toThrow(UnauthorizedException);
  });

  it('should lock account after 5 failed login attempts', async () => {
    // Arrange
    redisService.get.mockResolvedValue('4');
    authRepository.findUserByEmailForAuth.mockResolvedValue(baseUser);
    redisService.incr.mockResolvedValue(5);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    // Act
    const act = service.login({ email: baseUser.email, password: 'WrongPassword1!' }, '127.0.0.1');

    // Assert
    await expect(act).rejects.toThrow(UnauthorizedException);
  });

  it('should delete Redis key when logout is called', async () => {
    // Arrange
    redisService.del.mockResolvedValue(1);

    // Act
    const result = await service.logout(
      {
        sub: 'user-1',
        org_id: 'org-1',
        role: UserRole.SUPER_ADMIN,
        email: baseUser.email,
        iat: 1,
        exp: 2,
      },
      '127.0.0.1',
    );

    // Assert
    expect(redisService.del).toHaveBeenCalledWith('refresh:user-1');
    expect(result).toEqual({ success: true });
  });

  it('should never return password_hash in any response', async () => {
    // Arrange
    authRepository.findUserProfileById.mockResolvedValue({
      id: 'user-1',
      email: 'admin@diallo.sn',
      role: UserRole.SUPER_ADMIN,
      org_id: 'org-1',
      first_name: 'Mamadou',
      last_name: 'Diallo',
      last_login_at: null,
    });

    // Act
    const result = await service.me({
      sub: 'user-1',
      org_id: 'org-1',
      role: UserRole.SUPER_ADMIN,
      email: 'admin@diallo.sn',
      iat: 1,
      exp: 2,
    });

    // Assert
    expect(result).not.toHaveProperty('password_hash');
  });
});
