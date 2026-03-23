import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../common/realtime.module';
import { AuditService } from '../../common/services/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SyscohadaMappingService } from '../../common/services/syscohada-mapping.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [RealtimeModule],
  controllers: [ImportsController],
  providers: [ImportsService, PrismaService, AuditService, SyscohadaMappingService],
})
export class ImportsModule {}
