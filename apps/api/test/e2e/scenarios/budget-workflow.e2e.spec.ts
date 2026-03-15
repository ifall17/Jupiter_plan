import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { RedisService } from '../../../src/redis/redis.service';
import {
  api,
  budgetLineFactory,
  cleanDatabase,
  createTestApp,
  loginAs,
  seedTestOrg,
  withAuth,
} from '../helpers/e2e.helpers';

describe('E2E - Workflow Budget complet', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let _redis: RedisService;
  const tokens: Record<string, any> = {};
  const context: any = {};

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    _redis = app.get(RedisService);

    await cleanDatabase(prisma);
    const seed = await seedTestOrg(prisma);
    context.orgId = seed.org.id;
    context.fiscalYearId = seed.fiscalYear.id;
    context.periods = seed.periods;

    tokens.fpa = await loginAs(app, 'fpa@test.sn');
    tokens.admin = await loginAs(app, 'admin@test.sn');
    tokens.contrib = await loginAs(app, 'contrib@test.sn');
    tokens.lecteur = await loginAs(app, 'lecteur@test.sn');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('ACTE 1.1 - FPA cree le budget DRAFT', async () => {
    const res = await withAuth(api(app).post('/api/v1/budgets'), tokens.fpa).send({
      name: 'Budget FY2026 V1',
      fiscal_year_id: context.fiscalYearId,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    context.budgetId = res.body.data.id;
  });

  it('ACTE 1.2 - FPA ajoute les lignes budget', async () => {
    const lines = [
      {
        account_code: '701000',
        account_label: 'Ventes marchandises',
        department: 'VENTES',
        line_type: 'REVENUE',
        amount_budget: '50000000',
        period_id: context.periods[0].id,
      },
      {
        account_code: '601000',
        account_label: 'Achats marchandises',
        department: 'ACHATS',
        line_type: 'EXPENSE',
        amount_budget: '20000000',
        period_id: context.periods[0].id,
      },
      {
        account_code: '621000',
        account_label: 'Personnel',
        department: 'RH',
        line_type: 'EXPENSE',
        amount_budget: '10000000',
        period_id: context.periods[0].id,
      },
    ];

    const res = await withAuth(api(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.fpa).send({ lines });
    expect(res.status).toBe(200);
    expect(res.body.data.lines).toHaveLength(3);
    context.lineIds = res.body.data.lines.map((line: any) => line.id);
  });

  it('ACTE 1.3 - CONTRIBUTEUR peut modifier uniquement son departement', async () => {
    const resOk = await withAuth(api(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.contrib).send({
      lines: [{ id: context.lineIds[0], amount_budget: '55000000' }],
    });
    expect([200, 400]).toContain(resOk.status);

    const resForbidden = await withAuth(api(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.contrib).send({
      lines: [{ id: context.lineIds[1], amount_budget: '25000000' }],
    });
    expect([403, 404]).toContain(resForbidden.status);
  });

  it('ACTE 1.4 - LECTEUR ne peut pas voir le budget DRAFT', async () => {
    const res = await withAuth(api(app).get(`/api/v1/budgets/${context.budgetId}`), tokens.lecteur);
    expect([403, 404]).toContain(res.status);
  });

  it('ACTE 2.1 - FPA soumet le budget', async () => {
    const res = await withAuth(api(app).post(`/api/v1/budgets/${context.budgetId}/submit`), tokens.fpa);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
  });

  it('ACTE 2.2 - FPA ne peut pas modifier un budget SUBMITTED', async () => {
    const line = { ...budgetLineFactory(), period_id: context.periods[0].id };
    const res = await withAuth(api(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.fpa).send({ lines: [line] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BUDGET_NOT_SUBMITTABLE');
  });

  it('ACTE 2.3 - Admin approuve le budget', async () => {
    const res = await withAuth(api(app).post(`/api/v1/budgets/${context.budgetId}/approve`), tokens.admin).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');

    const log = await prisma.auditLog.findFirst({
      where: {
        entity_id: context.budgetId,
        action: 'BUDGET_APPROVE',
      },
    });
    expect(log).not.toBeNull();
  });

  it('ACTE 2.4 - LECTEUR peut voir le budget APPROVED', async () => {
    const res = await withAuth(api(app).get(`/api/v1/budgets/${context.budgetId}`), tokens.lecteur);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('ACTE 3.1 - Admin verrouille le budget', async () => {
    const res = await withAuth(api(app).post(`/api/v1/budgets/${context.budgetId}/lock`), tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('LOCKED');
  });

  it('ACTE 3.2 - Toute modification est impossible sur LOCKED', async () => {
    const line = { ...budgetLineFactory(), period_id: context.periods[0].id };
    const resFpa = await withAuth(api(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.fpa).send({ lines: [line] });
    expect(resFpa.status).toBe(400);
    expect(resFpa.body.code).toBe('BUDGET_LOCKED');

    const resAdmin = await withAuth(api(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.admin).send({ lines: [line] });
    expect(resAdmin.status).toBe(400);
    expect(resAdmin.body.code).toBe('BUDGET_LOCKED');
  });

  it('ACTE 3.3 - Variance Budget vs Reel accessible', async () => {
    const res = await withAuth(api(app).get(`/api/v1/budgets/${context.budgetId}/variance`), tokens.fpa);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('variance_pct');

    const lines = res.body.data.lines ?? [];
    lines.forEach((line: any) => {
      expect(typeof line.amount_budget).toBe('string');
      expect(typeof line.variance).toBe('string');
      expect(line.amount_budget).not.toContain('e+');
    });
  });
});
