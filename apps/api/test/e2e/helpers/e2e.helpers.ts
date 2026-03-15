/// <reference types="node" />

import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PlanTier, PeriodStatus, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../src/prisma/prisma.service';
import * as dotenv from 'dotenv';
import * as path from 'path';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.test') });

if (!process.env.REDIS_PASSWORD && process.env.REDIS_URL) {
  try {
    const parsed = new URL(process.env.REDIS_URL);
    process.env.REDIS_PASSWORD = parsed.password;
  } catch {
    // Keep config validation fail-secure if URL is malformed.
  }
}

export type AuthToken = {
  access_token: string;
  refresh_token?: string;
  userId?: string;
};

export async function createTestApp(): Promise<INestApplication> {
  const { AppModule } = await import('../../../src/app.module');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  await app.init();
  return app;
}

export function api(app: INestApplication) {
  const server = app.getHttpServer();
  return {
    get: (path: string) => request(server).get(path),
    post: (path: string) => request(server).post(path),
    put: (path: string) => request(server).put(path),
    patch: (path: string) => request(server).patch(path),
    delete: (path: string) => request(server).delete(path),
  };
}

export function withAuth(req: any, token: AuthToken | string): any {
  const value = typeof token === 'string' ? token : token.access_token;
  return req.set('Authorization', `Bearer ${value}`);
}

export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    prisma.auditAccess.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.kpiValue.deleteMany(),
    prisma.kpi.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.financialSnapshot.deleteMany(),
    prisma.scenarioHypothesis.deleteMany(),
    prisma.scenario.deleteMany(),
    prisma.cashFlowPlan.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.importJob.deleteMany(),
    prisma.budgetLine.deleteMany(),
    prisma.budget.deleteMany(),
    prisma.period.deleteMany(),
    prisma.fiscalYear.deleteMany(),
    prisma.userDepartmentScope.deleteMany(),
    prisma.user.deleteMany(),
    prisma.bankAccount.deleteMany(),
    prisma.organization.deleteMany(),
  ]);
}

export async function seedTestOrg(
  prisma: PrismaService,
  params?: { name?: string },
): Promise<any> {
  const name = params?.name ?? 'Jupiter Test Org';
  const org = await prisma.organization.create({
    data: {
      name,
      country: 'SN',
      currency: 'XOF',
      plan: PlanTier.ENTERPRISE,
      is_active: true,
    },
  });

  const fiscalYear = await prisma.fiscalYear.create({
    data: {
      org_id: org.id,
      label: 'FY2026',
      start_date: new Date('2026-01-01T00:00:00.000Z'),
      end_date: new Date('2026-12-31T23:59:59.000Z'),
    },
  });

  const periods = await Promise.all(
    [1, 2, 3].map((periodNumber) =>
      prisma.period.create({
        data: {
          org_id: org.id,
          fiscal_year_id: fiscalYear.id,
          label: `P${periodNumber}`,
          period_number: periodNumber,
          start_date: new Date(Date.UTC(2026, periodNumber - 1, 1)),
          end_date: new Date(Date.UTC(2026, periodNumber, 0, 23, 59, 59)),
          status: PeriodStatus.OPEN,
        },
      }),
    ),
  );

  const password = 'Passw0rd!123';
  const passwordHash = await argon2.hash(password);

  const users = {
    admin: await prisma.user.create({
      data: {
        org_id: org.id,
        email: 'admin@test.sn',
        password_hash: passwordHash,
        first_name: 'Admin',
        last_name: 'User',
        role: UserRole.SUPER_ADMIN,
      },
    }),
    fpa: await prisma.user.create({
      data: {
        org_id: org.id,
        email: 'fpa@test.sn',
        password_hash: passwordHash,
        first_name: 'Fpa',
        last_name: 'User',
        role: UserRole.FPA,
      },
    }),
    contrib: await prisma.user.create({
      data: {
        org_id: org.id,
        email: 'contrib@test.sn',
        password_hash: passwordHash,
        first_name: 'Contrib',
        last_name: 'User',
        role: UserRole.CONTRIBUTEUR,
      },
    }),
    lecteur: await prisma.user.create({
      data: {
        org_id: org.id,
        email: 'lecteur@test.sn',
        password_hash: passwordHash,
        first_name: 'Lecteur',
        last_name: 'User',
        role: UserRole.LECTEUR,
      },
    }),
  };

  await prisma.userDepartmentScope.create({
    data: {
      user_id: users.contrib.id,
      department: 'VENTES',
      can_read: true,
      can_write: true,
    },
  });

  return {
    org,
    fiscalYear,
    periods,
    users,
    password,
  };
}

export async function seedTestBudget(
  prisma: PrismaService,
  orgId: string,
  fiscalYearId: string,
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'LOCKED' | 'REJECTED' = 'APPROVED',
): Promise<any> {
  const budget = await prisma.budget.create({
    data: {
      org_id: orgId,
      fiscal_year_id: fiscalYearId,
      name: 'Seed Budget',
      status,
      version: 1,
    },
  });
  return { budget };
}

export async function loginAs(app: INestApplication, email: string, password = 'Passw0rd!123'): Promise<AuthToken> {
  const res = await api(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Unable to login as ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    access_token: res.body.data.access_token,
    refresh_token: res.body.data.refresh_token,
    userId: res.body.data.user?.id,
  };
}

export async function waitForJobStatus(
  app: INestApplication,
  token: AuthToken,
  jobId: string,
  expectedStatus: string,
  timeoutMs: number,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await withAuth(api(app).get(`/api/v1/imports/${jobId}`), token);
    const status = res.body?.data?.status;
    if (status === expectedStatus) {
      return res.body.data;
    }
    if (status === 'FAILED') {
      throw new Error(`Job ${jobId} failed: ${JSON.stringify(res.body)}`);
    }
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for ${expectedStatus} on job ${jobId}`);
}

export async function waitForScenarioStatus(
  app: INestApplication,
  token: AuthToken,
  scenarioId: string,
  expectedStatus: string,
  timeoutMs: number,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await withAuth(api(app).get(`/api/v1/scenarios/${scenarioId}`), token);
    if (res.body?.data?.status === expectedStatus) {
      return res.body.data;
    }
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for scenario ${scenarioId} => ${expectedStatus}`);
}

export async function waitForPeriodStatus(
  app: INestApplication,
  token: AuthToken,
  periodId: string,
  expectedStatus: string,
  timeoutMs: number,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await withAuth(api(app).get(`/api/v1/periods/${periodId}`), token);
    if (res.body?.data?.status === expectedStatus) {
      return res.body.data;
    }
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for period ${periodId} => ${expectedStatus}`);
}

export async function createAndSaveScenario(
  app: INestApplication,
  token: AuthToken,
  budgetId: string,
): Promise<any> {
  const created = await withAuth(api(app).post('/api/v1/scenarios'), token).send({
    name: `Scenario ${Date.now()}`,
    type: 'BASE',
    budget_id: budgetId,
  });

  const scenarioId = created.body?.data?.id;
  await withAuth(api(app).put(`/api/v1/scenarios/${scenarioId}/hypotheses`), token).send({
    hypotheses: [
      { label: 'Croissance', parameter: 'revenue_growth', value: '10', unit: '%' },
    ],
  });
  await withAuth(api(app).post(`/api/v1/scenarios/${scenarioId}/calculate`), token);
  await waitForScenarioStatus(app, token, scenarioId, 'CALCULATED', 30000);
  await withAuth(api(app).post(`/api/v1/scenarios/${scenarioId}/save`), token);
  return { id: scenarioId };
}

export async function createTestTransactions(
  prisma: PrismaService,
  orgId: string,
  periodId: string,
  count: number,
  options?: { is_validated?: boolean },
): Promise<void> {
  const rows = Array.from({ length: count }).map((_, idx) => ({
    org_id: orgId,
    period_id: periodId,
    account_code: '701000',
    account_label: `Transaction ${idx + 1}`,
    department: 'VENTES',
    amount: '1000',
    is_validated: options?.is_validated ?? false,
  }));

  await prisma.transaction.createMany({ data: rows as any });
}

export async function generateTestExcel(rows: Array<{
  account_code: string;
  amount: number;
  department: string;
  label: string;
}>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow(['account_code', 'account_label', 'department', 'amount']);
  rows.forEach((row) => {
    sheet.addRow([row.account_code, row.label, row.department, row.amount]);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export function generateExpiredToken(orgId: string): string {
  const secret = process.env.JWT_SECRET ?? 'test-jwt-secret-minimum-32-characters-long';
  return jwt.sign(
    {
      sub: 'expired-user',
      org_id: orgId,
      role: 'SUPER_ADMIN',
      email: 'expired@test.sn',
    },
    secret,
    { algorithm: 'HS256', expiresIn: -10 },
  );
}

export function budgetLineFactory(): any {
  return {
    account_code: '701000',
    account_label: 'Ventes',
    department: 'VENTES',
    line_type: 'REVENUE',
    amount_budget: '1000000',
    period_id: 'period-id-placeholder',
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
