import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyscohadaMappingService } from '../../common/services/syscohada-mapping.service';
import { DashboardController } from './dashboard.controller';
import {
  AlertsRepository,
  DashboardService,
  KpisRepository,
  SnapshotsRepository,
} from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    KpisRepository,
    AlertsRepository,
    SnapshotsRepository,
    PrismaService,
    SyscohadaMappingService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
