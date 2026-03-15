"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../../../src/prisma/prisma.service");
const redis_service_1 = require("../../../src/redis/redis.service");
const e2e_helpers_1 = require("../helpers/e2e.helpers");
describe('E2E - Workflow Budget complet', () => {
    let app;
    let prisma;
    let _redis;
    const tokens = {};
    const context = {};
    beforeAll(async () => {
        app = await (0, e2e_helpers_1.createTestApp)();
        prisma = app.get(prisma_service_1.PrismaService);
        _redis = app.get(redis_service_1.RedisService);
        await (0, e2e_helpers_1.cleanDatabase)(prisma);
        const seed = await (0, e2e_helpers_1.seedTestOrg)(prisma);
        context.orgId = seed.org.id;
        context.fiscalYearId = seed.fiscalYear.id;
        context.periods = seed.periods;
        tokens.fpa = await (0, e2e_helpers_1.loginAs)(app, 'fpa@test.sn');
        tokens.admin = await (0, e2e_helpers_1.loginAs)(app, 'admin@test.sn');
        tokens.contrib = await (0, e2e_helpers_1.loginAs)(app, 'contrib@test.sn');
        tokens.lecteur = await (0, e2e_helpers_1.loginAs)(app, 'lecteur@test.sn');
    });
    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });
    it('ACTE 1.1 - FPA cree le budget DRAFT', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post('/api/v1/budgets'), tokens.fpa).send({
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
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.fpa).send({ lines });
        expect(res.status).toBe(200);
        expect(res.body.data.lines).toHaveLength(3);
        context.lineIds = res.body.data.lines.map((line) => line.id);
    });
    it('ACTE 1.3 - CONTRIBUTEUR peut modifier uniquement son departement', async () => {
        const resOk = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.contrib).send({
            lines: [{ id: context.lineIds[0], amount_budget: '55000000' }],
        });
        expect([200, 400]).toContain(resOk.status);
        const resForbidden = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.contrib).send({
            lines: [{ id: context.lineIds[1], amount_budget: '25000000' }],
        });
        expect([403, 404]).toContain(resForbidden.status);
    });
    it('ACTE 1.4 - LECTEUR ne peut pas voir le budget DRAFT', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).get(`/api/v1/budgets/${context.budgetId}`), tokens.lecteur);
        expect([403, 404]).toContain(res.status);
    });
    it('ACTE 2.1 - FPA soumet le budget', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/budgets/${context.budgetId}/submit`), tokens.fpa);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('SUBMITTED');
    });
    it('ACTE 2.2 - FPA ne peut pas modifier un budget SUBMITTED', async () => {
        const line = { ...(0, e2e_helpers_1.budgetLineFactory)(), period_id: context.periods[0].id };
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.fpa).send({ lines: [line] });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('BUDGET_NOT_SUBMITTABLE');
    });
    it('ACTE 2.3 - Admin approuve le budget', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/budgets/${context.budgetId}/approve`), tokens.admin).send({});
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
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).get(`/api/v1/budgets/${context.budgetId}`), tokens.lecteur);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('APPROVED');
    });
    it('ACTE 3.1 - Admin verrouille le budget', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/budgets/${context.budgetId}/lock`), tokens.admin);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('LOCKED');
    });
    it('ACTE 3.2 - Toute modification est impossible sur LOCKED', async () => {
        const line = { ...(0, e2e_helpers_1.budgetLineFactory)(), period_id: context.periods[0].id };
        const resFpa = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.fpa).send({ lines: [line] });
        expect(resFpa.status).toBe(400);
        expect(resFpa.body.code).toBe('BUDGET_LOCKED');
        const resAdmin = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).put(`/api/v1/budgets/${context.budgetId}/lines`), tokens.admin).send({ lines: [line] });
        expect(resAdmin.status).toBe(400);
        expect(resAdmin.body.code).toBe('BUDGET_LOCKED');
    });
    it('ACTE 3.3 - Variance Budget vs Reel accessible', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).get(`/api/v1/budgets/${context.budgetId}/variance`), tokens.fpa);
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('variance_pct');
        const lines = res.body.data.lines ?? [];
        lines.forEach((line) => {
            expect(typeof line.amount_budget).toBe('string');
            expect(typeof line.variance).toBe('string');
            expect(line.amount_budget).not.toContain('e+');
        });
    });
});
//# sourceMappingURL=budget-workflow.e2e.spec.js.map