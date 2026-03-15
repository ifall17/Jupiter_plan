"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../../../src/prisma/prisma.service");
const e2e_helpers_1 = require("../helpers/e2e.helpers");
describe('E2E - Workflow Cloture de Periode', () => {
    let app;
    let prisma;
    const context = {};
    const tokens = {};
    beforeAll(async () => {
        app = await (0, e2e_helpers_1.createTestApp)();
        prisma = app.get(prisma_service_1.PrismaService);
        await (0, e2e_helpers_1.cleanDatabase)(prisma);
        const seed = await (0, e2e_helpers_1.seedTestOrg)(prisma);
        context.orgId = seed.org.id;
        context.periods = seed.periods;
        tokens.fpa = await (0, e2e_helpers_1.loginAs)(app, 'fpa@test.sn');
    });
    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });
    it('ACTE 1 - Cloture bloquee si transactions non validees', async () => {
        await (0, e2e_helpers_1.createTestTransactions)(prisma, context.orgId, context.periods[0].id, 3, { is_validated: false });
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/periods/${context.periods[0].id}/close`), tokens.fpa);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('PERIOD_HAS_PENDING_TX');
        expect(res.body.data.pending_count).toBe(3);
    });
    it('ACTE 2 - Valider toutes les transactions en batch', async () => {
        const txs = await prisma.transaction.findMany({
            where: { period_id: context.periods[0].id, is_validated: false },
        });
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).patch('/api/v1/transactions/validate-batch'), tokens.fpa).send({
            ids: txs.map((t) => t.id),
        });
        expect(res.status).toBe(200);
        expect(res.body.data.validated).toBe(txs.length);
    });
    it('ACTE 3 - Cloture reussie apres validation complete', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/periods/${context.periods[0].id}/close`), tokens.fpa);
        expect(res.status).toBe(202);
        expect(res.body.data.status).toBe('PROCESSING');
        context.closingJobId = res.body.data.job_id;
    });
    it('ACTE 4 - Attendre cloture et verifier CLOSED', async () => {
        const period = await (0, e2e_helpers_1.waitForPeriodStatus)(app, tokens.fpa, context.periods[0].id, 'CLOSED', 30000);
        expect(period.status).toBe('CLOSED');
        expect(period.closed_at).not.toBeNull();
        const snapshot = await prisma.financialSnapshot.findFirst({
            where: { period_id: context.periods[0].id, scenario_id: null },
        });
        expect(snapshot).not.toBeNull();
        const assets = Number(snapshot?.bs_assets ?? 0);
        const liabilities = Number(snapshot?.bs_liabilities ?? 0);
        const equity = Number(snapshot?.bs_equity ?? 0);
        expect(Math.abs(assets - (liabilities + equity))).toBeLessThan(0.01);
    });
    it('ACTE 5 - Periode CLOSED irreversible', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/periods/${context.periods[0].id}/close`), tokens.fpa);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('PERIOD_ALREADY_CLOSED');
    });
    it('ACTE 6 - Periode suivante automatiquement OPEN', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).get(`/api/v1/periods/${context.periods[1].id}`), tokens.fpa);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('OPEN');
    });
});
//# sourceMappingURL=closing-workflow.e2e.spec.js.map