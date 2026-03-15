import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import {
  AlertsRepository,
  DashboardService,
  KpisRepository,
  SnapshotsRepository,
} from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardService,
    KpisRepository,
    AlertsRepository,
    SnapshotsRepository,
    PrismaService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
