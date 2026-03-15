import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, PrismaService],
})
export class ImportsModule {}
