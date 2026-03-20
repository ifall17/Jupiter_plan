import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  api,
  cleanDatabase,
  createTestApp,
  loginAs,
  seedTestOrg,
  withAuth,
} from '../helpers/e2e.helpers';

describe('E2E - Transaction ➜ BudgetLine Sync (100% Automatic Variance)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const context: any = {};
  const tokens: Record<string, any> = {};

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);

    const seed = await seedTestOrg(prisma);
    context.orgId = seed.org.id;
    context.periods = seed.periods;
    context.fiscalYearId = seed.fiscal_year.id;

    tokens.fpa = await loginAs(app, 'fpa@test.sn');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('ACTE 1 - Creer budget avec lignes (amount_budget)', async () => {
    const res = await withAuth(api(app).post('/api/v1/budgets'), tokens.fpa).send({
      name: 'Budget Test Sync',
      fiscal_year_id: context.fiscalYearId,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    context.budgetId = res.body.data.id;

    // Add budget lines
    const lineRes = await withAuth(api(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.fpa).send({
      lines: [
        {
          period_id: context.periods[0].id,
          account_code: '701000',
          account_label: 'Ventes marchandises',
          department: 'VENTES',
          line_type: 'REVENUE',
          amount_budget: '100000.00',
        },
        {
          period_id: context.periods[0].id,
          account_code: '601000',
          account_label: 'Achats marchandises',
          department: 'ACHATS',
          line_type: 'EXPENSE',
          amount_budget: '50000.00',
        },
      ],
    });

    expect(lineRes.status).toBe(200);
    expect(lineRes.body.data.lines).toHaveLength(2);

    // Verify budget_lines created with amount_actual = 0
    const budgetLines = await prisma.budgetLine.findMany({
      where: { budget_id: context.budgetId },
    });
    expect(budgetLines).toHaveLength(2);
    expect(budgetLines[0].amount_actual.toString()).toBe('0');
    expect(budgetLines[1].amount_actual.toString()).toBe('0');
  });

  it('ACTE 2 - Creer transactions correspondantes (non validees)', async () => {
    // Create transactions that match the budget lines (same account_code, period, department)
    const tx1Res = await withAuth(api(app).post('/api/v1/transactions'), tokens.fpa).send({
      transaction_date: new Date().toISOString().split('T')[0],
      account_code: '701000',
      label: 'Ventes marchandises',
      department: 'VENTES',
      line_type: 'REVENUE',
      amount: '75000.00',
      period_id: context.periods[0].id,
    });

    expect(tx1Res.status).toBe(201);
    expect(tx1Res.body.data.is_validated).toBe(false);
    context.tx1Id = tx1Res.body.data.id;

    const tx2Res = await withAuth(api(app).post('/api/v1/transactions'), tokens.fpa).send({
      transaction_date: new Date().toISOString().split('T')[0],
      account_code: '601000',
      label: 'Achats marchandises',
      department: 'ACHATS',
      line_type: 'EXPENSE',
      amount: '30000.00',
      period_id: context.periods[0].id,
    });

    expect(tx2Res.status).toBe(201);
    context.tx2Id = tx2Res.body.data.id;

    // Verify budget_lines still have amount_actual = 0 (transactions not validated yet)
    const budgetLines = await prisma.budgetLine.findMany({
      where: { budget_id: context.budgetId },
      orderBy: { account_code: 'asc' },
    });
    expect(budgetLines[1].amount_actual.toString()).toBe('0'); // 601000
    expect(budgetLines[0].amount_actual.toString()).toBe('0'); // 701000
  });

  it('ACTE 3 - Valider transactions en batch = AUTO SYNC to budget_lines', async () => {
    const res = await withAuth(api(app).patch('/api/v1/transactions/validate-batch'), tokens.fpa).send({
      ids: [context.tx1Id, context.tx2Id],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);

    // CRITICALLY: Verify budget_lines.amount_actual now synced from validated transactions
    const budgetLines = await prisma.budgetLine.findMany({
      where: { budget_id: context.budgetId },
      orderBy: { account_code: 'asc' },
    });

    // 601000 (EXPENSE) - should be 30000.00 (absolute value of -30000.00 from transaction)
    const line601 = budgetLines.find((l) => l.account_code === '601000');
    expect(line601?.amount_actual.toString()).toBe('30000.00');

    // 701000 (REVENUE) - should be 75000.00
    const line701 = budgetLines.find((l) => l.account_code === '701000');
    expect(line701?.amount_actual.toString()).toBe('75000.00');
  });

  it('ACTE 4 - Verifier variance calculee AUTOMATIQUEMENT', async () => {
    // Get variance endpoint should show automatic variance calculation
    const res = await withAuth(api(app).get(`/api/v1/budgets/${context.budgetId}/variance`), tokens.fpa);

    expect(res.status).toBe(200);
    expect(res.body.data.lines).toHaveLength(2);

    // 701000: budget=100000, actual=75000, variance=-25%
    const line701 = res.body.data.lines.find((l: any) => l.account_code === '701000');
    expect(line701).toBeDefined();
    expect(line701.amount_budget).toBe('100000.00');
    expect(line701.amount_actual).toBe('75000.00');
    expect(line701.variance).toBe('-25000.00');
    expect(parseFloat(line701.variance_pct)).toBeLessThan(-24); // -25%

    // 601000: budget=50000, actual=30000, variance=-40%
    const line601 = res.body.data.lines.find((l: any) => l.account_code === '601000');
    expect(line601).toBeDefined();
    expect(line601.amount_budget).toBe('50000.00');
    expect(line601.amount_actual).toBe('30000.00');
    expect(line601.variance).toBe('-20000.00');
    expect(parseFloat(line601.variance_pct)).toBeLessThan(-39); // -40%
  });

  it('ACTE 5 - Ajouter transaction = AUTO SYNC incremental', async () => {
    // Add another transaction for 701000
    const tx3Res = await withAuth(api(app).post('/api/v1/transactions'), tokens.fpa).send({
      transaction_date: new Date().toISOString().split('T')[0],
      account_code: '701000',
      label: 'Ventes marchandises',
      department: 'VENTES',
      line_type: 'REVENUE',
      amount: '15000.00',
      period_id: context.periods[0].id,
    });

    expect(tx3Res.status).toBe(201);
    context.tx3Id = tx3Res.body.data.id;

    // Validate it
    const validateRes = await withAuth(api(app).patch('/api/v1/transactions/validate-batch'), tokens.fpa).send({
      ids: [context.tx3Id],
    });

    expect(validateRes.status).toBe(200);

    // Verify budget_line 701000 updated to 75000 + 15000 = 90000
    const line701 = await prisma.budgetLine.findFirst({
      where: {
        budget_id: context.budgetId,
        account_code: '701000',
      },
    });

    expect(line701?.amount_actual.toString()).toBe('90000.00');
  });

  it('ACTE 6 - Multiple transactions same account = SUM aggregate', async () => {
    // Verify that multiple transactions for the same account_code aggregate correctly
    const line601 = await prisma.budgetLine.findFirst({
      where: {
        budget_id: context.budgetId,
        account_code: '601000',
      },
    });

    // Should still be 30000 (only 1 transaction for this account)
    expect(line601?.amount_actual.toString()).toBe('30000.00');

    // Add more transactions for 601000
    const tx4Res = await withAuth(api(app).post('/api/v1/transactions'), tokens.fpa).send({
      transaction_date: new Date().toISOString().split('T')[0],
      account_code: '601000',
      label: 'Achats marchandises',
      department: 'ACHATS',
      line_type: 'EXPENSE',
      amount: '5000.00',
      period_id: context.periods[0].id,
    });

    const tx5Res = await withAuth(api(app).post('/api/v1/transactions'), tokens.fpa).send({
      transaction_date: new Date().toISOString().split('T')[0],
      account_code: '601000',
      label: 'Achats marchandises',
      department: 'ACHATS',
      line_type: 'EXPENSE',
      amount: '3000.00',
      period_id: context.periods[0].id,
    });

    // Validate all EXPENSE transactions for 601000
    const validateRes = await withAuth(api(app).patch('/api/v1/transactions/validate-batch'), tokens.fpa).send({
      ids: [tx4Res.body.data.id, tx5Res.body.data.id],
    });

    expect(validateRes.status).toBe(200);

    // Verify sync: 30000 + 5000 + 3000 = 38000
    const updatedLine601 = await prisma.budgetLine.findFirst({
      where: {
        budget_id: context.budgetId,
        account_code: '601000',
      },
    });

    expect(updatedLine601?.amount_actual.toString()).toBe('38000.00');
  });

  it('ACTE 7 - Cross-period isolation (period 2 budget lines unaffected)', async () => {
    // Create budget line for period 2 with same account code
    const lineRes = await withAuth(api(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.fpa).send({
      lines: [
        {
          period_id: context.periods[1].id,
          account_code: '701000', // Same account code as period 1
          account_label: 'Ventes marchandises',
          department: 'VENTES',
          line_type: 'REVENUE',
          amount_budget: '200000.00',
        },
      ],
    });

    expect(lineRes.status).toBe(200);

    // Create transaction in period 2
    const txPeriod2Res = await withAuth(api(app).post('/api/v1/transactions'), tokens.fpa).send({
      transaction_date: new Date().toISOString().split('T')[0],
      account_code: '701000',
      label: 'Ventes marchandises',
      department: 'VENTES',
      line_type: 'REVENUE',
      amount: '50000.00',
      period_id: context.periods[1].id,
    });

    // Validate it
    const validateRes = await withAuth(api(app).patch('/api/v1/transactions/validate-batch'), tokens.fpa).send({
      ids: [txPeriod2Res.body.data.id],
    });

    expect(validateRes.status).toBe(200);

    // Verify period 1 line 701000 still has 90000 (not affected)
    const linePeriod1 = await prisma.budgetLine.findFirst({
      where: {
        budget_id: context.budgetId,
        account_code: '701000',
        period_id: context.periods[0].id,
      },
    });
    expect(linePeriod1?.amount_actual.toString()).toBe('90000.00');

    // Verify period 2 line 701000 has 50000 (synced from period 2 transaction)
    const linePeriod2 = await prisma.budgetLine.findFirst({
      where: {
        budget_id: context.budgetId,
        account_code: '701000',
        period_id: context.periods[1].id,
      },
    });
    expect(linePeriod2?.amount_actual.toString()).toBe('50000.00');
  });
});
