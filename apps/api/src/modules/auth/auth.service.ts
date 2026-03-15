import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthRepository } from './auth.repository';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { AuditAction, UserRole } from '@shared/enums';
import { RedisService } from '../../redis/redis.service';

const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_001',
  ACCOUNT_LOCKED: 'AUTH_002',
  TOKEN_EXPIRED: 'AUTH_003',
} as const;

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_ATTEMPTS_TTL_SECONDS = 15 * 60;
const MAX_LOGIN_ATTEMPTS = 5;

export interface JwtPayload {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
  department_scope?: Array<{ department: string; can_read: boolean; can_write: boolean }>;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private get accessTokenTtl(): string {
    return this.configService.get<string>('JWT_ACCESS_EXPIRY') ?? '8h';
  }

  private get refreshTokenTtl(): string {
    return this.configService.get<string>('JWT_REFRESH_EXPIRY') ?? '30d';
  }

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const attempts = await this.getLoginAttempts(email);

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      this.logSecurityEvent('AUTH_LOGIN_BLOCKED', {
        org_id: 'unknown',
        user_id: 'unknown',
        ip_address: ipAddress,
        outcome: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
      });
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        message: 'Account temporarily locked.',
      });
    }

    const user = await this.authRepository.findUserByEmailForAuth(email);
    if (!user) {
      await this.registerFailedLogin(email, ipAddress);
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid credentials.',
      });
    }

    if (!user.is_active) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        message: 'Account temporarily locked.',
      });
    }

    const isPasswordValid = await argon2.verify(user.password_hash, dto.password);
    if (!isPasswordValid) {
      await this.registerFailedLogin(email, ipAddress, user.id, user.org_id);
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid credentials.',
      });
    }

    await this.clearLoginAttempts(email);

    const tokenPayload = {
      sub: user.id,
      org_id: user.org_id,
      role: user.role as UserRole,
      email: user.email,
      department_scope: user.department_scopes,
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(tokenPayload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        algorithm: 'HS256',
        expiresIn: this.accessTokenTtl,
      }),
      this.jwtService.signAsync(tokenPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        algorithm: 'HS256',
        expiresIn: this.refreshTokenTtl,
      }),
    ]);

    await this.storeRefreshToken(user.id, refresh_token);
    await this.authRepository.updateLastLoginAt(user.id, new Date());
    await this.authRepository.createAuditLog({
      org_id: user.org_id,
      user_id: user.id,
      action: AuditAction.LOGIN,
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
        role: user.role as UserRole,
        org_id: user.org_id,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
        message: 'Token expired or invalid.',
      });
    }

    if (!payload?.exp) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
        message: 'Token expired or invalid.',
      });
    }

    const redisKey = this.getRefreshKey(payload.sub);
    let storedHash: string | null = null;
    try {
      storedHash = await this.redisService.get(redisKey);
    } catch (error) {
      this.logSecurityEvent('AUTH_REDIS_ERROR', {
        user_id: payload.sub,
        org_id: payload.org_id,
        outcome: 'REDIS_FAILURE',
      });
      throw new InternalServerErrorException('Authentication unavailable.');
    }

    if (!storedHash) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
        message: 'Token expired or invalid.',
      });
    }

    const isRefreshValid = await argon2.verify(storedHash, refreshToken);
    if (!isRefreshValid) {
      throw new UnauthorizedException({
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
        secret: this.configService.get<string>('JWT_SECRET'),
        algorithm: 'HS256',
        expiresIn: this.accessTokenTtl,
      }),
      this.jwtService.signAsync(newPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        algorithm: 'HS256',
        expiresIn: this.refreshTokenTtl,
      }),
    ]);

    try {
      const hashedRefreshToken = await argon2.hash(refresh_token, { type: argon2.argon2id });
      await this.redisService.set(redisKey, hashedRefreshToken, 'EX', REFRESH_TTL_SECONDS);
    } catch {
      throw new InternalServerErrorException('Authentication unavailable.');
    }

    this.logSecurityEvent('AUTH_REFRESH_SUCCESS', {
      user_id: payload.sub,
      org_id: payload.org_id,
      outcome: 'SUCCESS',
      token_prefix: this.maskToken(access_token),
    });

    const userProfile = await this.authRepository.findUserProfileById(payload.sub, payload.org_id);
    if (!userProfile) {
      throw new UnauthorizedException({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS, message: 'User not found.' });
    }

    return {
      access_token,
      refresh_token,
      user: {
        id: userProfile.id,
        email: userProfile.email,
        role: userProfile.role as UserRole,
        org_id: userProfile.org_id,
        first_name: userProfile.first_name,
        last_name: userProfile.last_name,
      },
    };
  }

  async logout(payload: JwtPayload, ipAddress?: string): Promise<{ success: true }> {
    const redisKey = this.getRefreshKey(payload.sub);
    try {
      const deleted = await this.redisService.del(redisKey);
      this.logSecurityEvent('AUTH_LOGOUT_REDIS', {
        user_id: payload.sub,
        org_id: payload.org_id,
        outcome: deleted > 0 ? 'SESSION_INVALIDATED' : 'SESSION_ALREADY_INVALID',
      });
    } catch {
      throw new InternalServerErrorException('Authentication unavailable.');
    }

    await this.authRepository.createAuditLog({
      org_id: payload.org_id,
      user_id: payload.sub,
      action: AuditAction.LOGOUT,
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

  async me(payload: JwtPayload) {
    const user = await this.authRepository.findUserProfileById(payload.sub, payload.org_id);
    if (!user) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid credentials.',
      });
    }
    return user;
  }

  async validateUserCredentials(email: string, password: string) {
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
      role: user.role as UserRole,
      org_id: user.org_id,
      department_scope: user.department_scopes,
      first_name: user.first_name,
      last_name: user.last_name,
      last_login_at: user.last_login_at,
    };
  }

  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const redisKey = this.getRefreshKey(userId);
    const hashedRefreshToken = await argon2.hash(refreshToken, { type: argon2.argon2id });

    try {
      await this.redisService.set(redisKey, hashedRefreshToken, 'EX', REFRESH_TTL_SECONDS);
    } catch {
      throw new InternalServerErrorException('Authentication unavailable.');
    }
  }

  private async getLoginAttempts(email: string): Promise<number> {
    try {
      const raw = await this.redisService.get(this.getLoginAttemptKey(email));
      return raw ? Number.parseInt(raw, 10) : 0;
    } catch {
      this.logSecurityEvent('AUTH_REDIS_READ_FAILURE', {
        user_id: 'unknown',
        org_id: 'unknown',
        outcome: 'AUTH_LOCKDOWN_DUE_TO_REDIS_FAILURE',
      });
      // Fail secure on anti-bruteforce dependency failure.
      throw new InternalServerErrorException('Authentication unavailable.');
    }
  }

  private async registerFailedLogin(
    email: string,
    ipAddress?: string,
    userId?: string,
    orgId?: string,
  ): Promise<void> {
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
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
          message: 'Account temporarily locked.',
        });
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Authentication unavailable.');
    }
  }

  private async clearLoginAttempts(email: string): Promise<void> {
    try {
      await this.redisService.del(this.getLoginAttemptKey(email));
    } catch {
      throw new InternalServerErrorException('Authentication unavailable.');
    }
  }

  private getRefreshKey(userId: string): string {
    return `refresh:${userId}`;
  }

  private getLoginAttemptKey(email: string): string {
    return `login_attempts:${email}`;
  }

  private maskToken(token: string): string {
    return token.slice(0, 8);
  }

  private logSecurityEvent(eventType: string, payload: Record<string, unknown>): void {
    this.logger.log({
      timestamp: new Date().toISOString(),
      event_type: eventType,
      ...payload,
    });
  }
}
