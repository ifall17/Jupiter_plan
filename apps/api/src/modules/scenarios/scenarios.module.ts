import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';
import { ScenariosRepository } from './scenarios.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'calc-queue',
    }),
  ],
  controllers: [ScenariosController],
  providers: [ScenariosService, ScenariosRepository, PrismaService, AuditService],
  exports: [ScenariosService],
})
export class ScenariosModule {}
