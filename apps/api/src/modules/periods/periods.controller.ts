import { Controller, Get, HttpCode, Param, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PeriodsService } from './periods.service';

@Controller('periods')
export class PeriodsController {
  constructor(private readonly periodsService: PeriodsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.periodsService.findAll(user.org_id);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.periodsService.findOne(id, user.org_id);
  }

  @Post(':id/close')
  @HttpCode(202)
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async close(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (!user?.sub || !user?.org_id) {
      throw new UnauthorizedException();
    }

    return this.periodsService.closePeriod(id, {
      sub: user.sub,
      org_id: user.org_id,
      role: user.role as UserRole,
    });
  }
}
