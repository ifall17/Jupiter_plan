import { Module } from '@nestjs/common';
import { CashFlowController } from './cash-flow.controller';
import { CashFlowService } from './cash-flow.service';
import { CashFlowRepository } from './cash-flow.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [CashFlowController],
  providers: [CashFlowService, CashFlowRepository, PrismaService],
  exports: [CashFlowService],
})
export class CashFlowModule {}
