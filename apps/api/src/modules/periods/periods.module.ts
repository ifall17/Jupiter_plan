import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PeriodsController } from './periods.controller';
import { PeriodsService } from './periods.service';

@Module({
  controllers: [PeriodsController],
  providers: [PeriodsService, PrismaService],
})
export class PeriodsModule {}
