import { Module } from '@nestjs/common';
import { CalcEngineClient } from '../../common/services/calc-engine.client';
import { KpisController } from './kpis.controller';
import { KpisService } from './kpis.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [KpisController],
  providers: [KpisService, PrismaService, CalcEngineClient],
  exports: [KpisService],
})
export class KpisModule {}
