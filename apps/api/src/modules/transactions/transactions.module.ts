import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { SyscohadaMappingService } from '../../common/services/syscohada-mapping.service';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, PrismaService, SyscohadaMappingService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
