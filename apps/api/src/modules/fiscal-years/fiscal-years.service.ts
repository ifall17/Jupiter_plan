import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FiscalYearsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPeriods(fiscalYearId: string, orgId: string) {
    return this.prisma.period.findMany({
      where: {
        fiscal_year_id: fiscalYearId,
        fiscal_year: { org_id: orgId },
      },
      orderBy: { period_number: 'asc' },
      select: {
        id: true,
        label: true,
        period_number: true,
        status: true,
        start_date: true,
        end_date: true,
      },
    });
  }
}
