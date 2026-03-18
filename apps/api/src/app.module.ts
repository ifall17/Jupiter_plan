import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CashFlowModule } from './modules/cash-flow/cash-flow.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { ScenariosModule } from './modules/scenarios/scenarios.module';
import { KpisModule } from './modules/kpis/kpis.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FiscalYearsModule } from './modules/fiscal-years/fiscal-years.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ImportsModule } from './modules/imports/imports.module';
import { PeriodsModule } from './modules/periods/periods.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CommentsModule } from './modules/comments/comments.module';
import { JwtThrottlerGuard } from './common/guards/jwt-throttler.guard';
import { AppController } from './app.controller';

function validateEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }

  if (!env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET is required');
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  if (!env.REDIS_PASSWORD) {
    throw new Error('REDIS_PASSWORD is required');
  }

  if (!env.WEB_URL) {
    throw new Error('WEB_URL is required');
  }

  const origins = env.WEB_URL.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) {
    throw new Error('WEB_URL must contain at least one origin');
  }

  for (const origin of origins) {
    try {
      // Validate each configured origin to avoid permissive or malformed CORS setup.
      new URL(origin);
    } catch {
      throw new Error(`WEB_URL contains invalid origin: ${origin}`);
    }
  }

  return env;
}

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    RedisModule,
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL,
        password: process.env.REDIS_PASSWORD,
      },
    }),
    BullModule.registerQueue(
      { name: 'import-queue' },
      { name: 'calc-queue' },
      { name: 'notif-queue' },
      { name: 'export-queue' },
    ),
    AuthModule,
    UsersModule,
    BudgetsModule,
    CashFlowModule,
    BankAccountsModule,
    ScenariosModule,
    KpisModule,
    AlertsModule,
    DashboardModule,
    FiscalYearsModule,
    TransactionsModule,
    ImportsModule,
    PeriodsModule,
    CommentsModule,
    ReportsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtThrottlerGuard,
    },
  ],
})
export class AppModule {}
