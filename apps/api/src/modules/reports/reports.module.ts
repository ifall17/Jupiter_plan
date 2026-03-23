import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SyscohadaMappingService } from '../../common/services/syscohada-mapping.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [HttpModule],
  controllers: [ReportsController],
  providers: [ReportsService, PrismaService, SyscohadaMappingService],
})
export class ReportsModule {}
