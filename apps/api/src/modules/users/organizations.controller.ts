import { Controller, Get, NotFoundException, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { FiscalStatus, PeriodStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { PrismaService } from '../../prisma/prisma.service';

interface OrgCurrentUser {
  sub: string;
  org_id: string;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('current')
  @UseGuards(JwtAuthGuard, OrgGuard)
  async getCurrent(@Req() req: Request) {
    const user = req.user as OrgCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: user.org_id },
      select: { id: true, name: true, currency: true },
    });

    if (!org) {
      throw new NotFoundException('Organisation introuvable');
    }

    const fiscalYear = await this.prisma.fiscalYear.findFirst({
      where: { org_id: user.org_id, status: FiscalStatus.ACTIVE },
      orderBy: { start_date: 'desc' },
    });

    const period = await this.prisma.period.findFirst({
      where: {
        org_id: user.org_id,
        status: PeriodStatus.OPEN,
        ...(fiscalYear ? { fiscal_year_id: fiscalYear.id } : {}),
      },
      orderBy: { period_number: 'desc' },
    });

    return {
      id: org.id,
      name: org.name,
      currency: org.currency,
      current_period_id: period?.id ?? null,
      fiscal_year_id: fiscalYear?.id ?? null,
    };
  }
}
