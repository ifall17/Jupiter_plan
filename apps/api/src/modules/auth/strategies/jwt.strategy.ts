import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@shared/enums';

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
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.exp) {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
