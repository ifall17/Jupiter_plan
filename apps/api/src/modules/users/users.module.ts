import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UsersController } from './users.controller';
import { OrganizationsController } from './organizations.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notif-queue',
    }),
  ],
  controllers: [UsersController, OrganizationsController],
  providers: [UsersService, UsersRepository, PrismaService, RedisService],
  exports: [UsersService],
})
export class UsersModule {}
