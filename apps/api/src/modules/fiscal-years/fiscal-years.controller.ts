import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { FiscalYearsService } from './fiscal-years.service';

@Controller('fiscal-years')
export class FiscalYearsController {
  constructor(private readonly fiscalYearsService: FiscalYearsService) {}

  @Get(':id/periods')
  @UseGuards(JwtAuthGuard)
  async getPeriods(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.fiscalYearsService.getPeriods(id, user.org_id);
  }
}
