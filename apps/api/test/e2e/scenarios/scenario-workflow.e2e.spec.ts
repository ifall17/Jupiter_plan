import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  api,
  cleanDatabase,
  createAndSaveScenario,
  createTestApp,
  loginAs,
  seedTestBudget,
  seedTestOrg,
  waitForScenarioStatus,
  withAuth,
} from '../helpers/e2e.helpers';

describe('E2E - Workflow Scenarios', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, any> = {};
  const context: any = {};

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);

    const seed = await seedTestOrg(prisma);
    const { budget } = await seedTestBudget(prisma, seed.org.id, seed.fiscalYear.id, 'APPROVED');

    context.orgId = seed.org.id;
    context.budgetId = budget.id;
    tokens.fpa = await loginAs(app, 'fpa@test.sn');
    tokens.lecteur = await loginAs(app, 'lecteur@test.sn');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('ACTE 1 - Creer scenario BASE depuis budget APPROVED', async () => {
    const res = await withAuth(api(app).post('/api/v1/scenarios'), tokens.fpa).send({
      name: 'Scenario Base 2026',
      type: 'BASE',
      budget_id: context.budgetId,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    context.scenarioId = res.body.data.id;
  });

  it('ACTE 2 - Ajouter hypotheses', async () => {
    const res = await withAuth(api(app).put(`/api/v1/scenarios/${context.scenarioId}/hypotheses`), tokens.fpa).send({
      hypotheses: [
        { label: 'Croissance CA', parameter: 'revenue_growth', value: '15', unit: '%' },
        { label: 'Reduction charges', parameter: 'cost_reduction', value: '5', unit: '%' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.hypotheses).toHaveLength(2);
  });

  it('ACTE 3 - Lancer le calcul', async () => {
    const res = await withAuth(api(app).post(`/api/v1/scenarios/${context.scenarioId}/calculate`), tokens.fpa);
    expect(res.status).toBe(202);

    await waitForScenarioStatus(app, tokens.fpa, context.scenarioId, 'CALCULATED', 30000);

    const snapshot = await prisma.financialSnapshot.findFirst({
      where: { scenario_id: context.scenarioId },
    });
    expect(snapshot).not.toBeNull();
  });

  it('ACTE 4 - Sauvegarder le scenario', async () => {
    const res = await withAuth(api(app).post(`/api/v1/scenarios/${context.scenarioId}/save`), tokens.fpa);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SAVED');
  });

  it('ACTE 5 - LECTEUR voit le scenario SAVED sans hypotheses', async () => {
    const res = await withAuth(api(app).get(`/api/v1/scenarios/${context.scenarioId}`), tokens.lecteur);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SAVED');
    expect(res.body.data.hypotheses).toBeNull();
  });

  it('ACTE 6 - Comparer max 4 scenarios', async () => {
    const ids = [context.scenarioId];
    for (let i = 0; i < 3; i += 1) {
      const scenario = await createAndSaveScenario(app, tokens.fpa, context.budgetId);
      ids.push(scenario.id);
    }

    const res = await withAuth(api(app).post('/api/v1/scenarios/compare'), tokens.fpa).send({ scenario_ids: ids });
    expect(res.status).toBe(200);
    expect(res.body.data.scenarios).toHaveLength(4);
  });

  it('ACTE 7 - Rejeter comparaison de 5 scenarios', async () => {
    const res = await withAuth(api(app).post('/api/v1/scenarios/compare'), tokens.fpa).send({
      scenario_ids: ['id1', 'id2', 'id3', 'id4', 'id5'],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SCENARIO_MAX_COMPARE');
  });
});
