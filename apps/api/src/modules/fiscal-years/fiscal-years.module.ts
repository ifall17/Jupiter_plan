import { Module } from '@nestjs/common';
import { FiscalYearsController } from './fiscal-years.controller';
import { FiscalYearsService } from './fiscal-years.service';

@Module({
  controllers: [FiscalYearsController],
  providers: [FiscalYearsService],
})
export class FiscalYearsModule {}
