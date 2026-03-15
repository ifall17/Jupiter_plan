import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';

@Module({
  controllers: [BankAccountsController],
  providers: [BankAccountsService, PrismaService, AuditService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
