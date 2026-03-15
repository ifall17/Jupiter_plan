"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../../../src/prisma/prisma.service");
const e2e_helpers_1 = require("../helpers/e2e.helpers");
describe('E2E - Workflow Scenarios', () => {
    let app;
    let prisma;
    const tokens = {};
    const context = {};
    beforeAll(async () => {
        app = await (0, e2e_helpers_1.createTestApp)();
        prisma = app.get(prisma_service_1.PrismaService);
        await (0, e2e_helpers_1.cleanDatabase)(prisma);
        const seed = await (0, e2e_helpers_1.seedTestOrg)(prisma);
        const { budget } = await (0, e2e_helpers_1.seedTestBudget)(prisma, seed.org.id, seed.fiscalYear.id, 'APPROVED');
        context.orgId = seed.org.id;
        context.budgetId = budget.id;
        tokens.fpa = await (0, e2e_helpers_1.loginAs)(app, 'fpa@test.sn');
        tokens.lecteur = await (0, e2e_helpers_1.loginAs)(app, 'lecteur@test.sn');
    });
    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });
    it('ACTE 1 - Creer scenario BASE depuis budget APPROVED', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post('/api/v1/scenarios'), tokens.fpa).send({
            name: 'Scenario Base 2026',
            type: 'BASE',
            budget_id: context.budgetId,
        });
        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('DRAFT');
        context.scenarioId = res.body.data.id;
    });
    it('ACTE 2 - Ajouter hypotheses', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).put(`/api/v1/scenarios/${context.scenarioId}/hypotheses`), tokens.fpa).send({
            hypotheses: [
                { label: 'Croissance CA', parameter: 'revenue_growth', value: '15', unit: '%' },
                { label: 'Reduction charges', parameter: 'cost_reduction', value: '5', unit: '%' },
            ],
        });
        expect(res.status).toBe(200);
        expect(res.body.data.hypotheses).toHaveLength(2);
    });
    it('ACTE 3 - Lancer le calcul', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/scenarios/${context.scenarioId}/calculate`), tokens.fpa);
        expect(res.status).toBe(202);
        await (0, e2e_helpers_1.waitForScenarioStatus)(app, tokens.fpa, context.scenarioId, 'CALCULATED', 30000);
        const snapshot = await prisma.financialSnapshot.findFirst({
            where: { scenario_id: context.scenarioId },
        });
        expect(snapshot).not.toBeNull();
    });
    it('ACTE 4 - Sauvegarder le scenario', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/scenarios/${context.scenarioId}/save`), tokens.fpa);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('SAVED');
    });
    it('ACTE 5 - LECTEUR voit le scenario SAVED sans hypotheses', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).get(`/api/v1/scenarios/${context.scenarioId}`), tokens.lecteur);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('SAVED');
        expect(res.body.data.hypotheses).toBeNull();
    });
    it('ACTE 6 - Comparer max 4 scenarios', async () => {
        const ids = [context.scenarioId];
        for (let i = 0; i < 3; i += 1) {
            const scenario = await (0, e2e_helpers_1.createAndSaveScenario)(app, tokens.fpa, context.budgetId);
            ids.push(scenario.id);
        }
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post('/api/v1/scenarios/compare'), tokens.fpa).send({ scenario_ids: ids });
        expect(res.status).toBe(200);
        expect(res.body.data.scenarios).toHaveLength(4);
    });
    it('ACTE 7 - Rejeter comparaison de 5 scenarios', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post('/api/v1/scenarios/compare'), tokens.fpa).send({
            scenario_ids: ['id1', 'id2', 'id3', 'id4', 'id5'],
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('SCENARIO_MAX_COMPARE');
    });
});
//# sourceMappingURL=scenario-workflow.e2e.spec.js.map