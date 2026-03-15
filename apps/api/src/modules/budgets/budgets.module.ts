import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetsRepository } from './budgets.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'calc-queue',
    }),
  ],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetsRepository, PrismaService, AuditService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
