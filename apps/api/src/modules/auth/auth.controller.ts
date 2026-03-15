import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService, JwtPayload } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@shared/enums';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<AuthResponseDto> {
    const tokens = await this.authService.login(dto, this.extractIp(request));
    response.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth/refresh',
    });
    return tokens;
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async refresh(@Body() dto: RefreshTokenDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokenFromCookie = (request.cookies as Record<string, string | undefined>)['refresh_token'];
    const token = tokenFromCookie ?? dto.refresh_token;
    if (!token) {
      throw new UnauthorizedException('Refresh token manquant');
    }
    const tokens = await this.authService.refresh(token);
    response.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth/refresh',
    });
    return tokens;
  }

  @Post('logout')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const payload = request.user as JwtPayload | undefined;
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    response.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
    return this.authService.logout(payload, this.extractIp(request));
  }

  @Get('me')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async me(@Req() request: Request) {
    const payload = request.user as JwtPayload | undefined;
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    return this.authService.me(payload);
  }

  private extractIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown'
    );
  }
}
