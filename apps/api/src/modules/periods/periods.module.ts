import { Module } from '@nestjs/common';
import { CalcEngineClient } from '../../common/services/calc-engine.client';
import { SyscohadaMappingService } from '../../common/services/syscohada-mapping.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PeriodsController } from './periods.controller';
import { PeriodsService } from './periods.service';

@Module({
  controllers: [PeriodsController],
  providers: [PeriodsService, PrismaService, CalcEngineClient, SyscohadaMappingService],
})
export class PeriodsModule {}
