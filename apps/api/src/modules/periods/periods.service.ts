import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.period.findMany({
      where: { fiscal_year: { org_id: orgId } },
      orderBy: [
        { fiscal_year: { start_date: 'desc' } },
        { period_number: 'asc' },
      ],
      select: {
        id: true,
        label: true,
        period_number: true,
        fiscal_year_id: true,
        status: true,
        start_date: true,
        end_date: true,
      },
    });
  }
}
