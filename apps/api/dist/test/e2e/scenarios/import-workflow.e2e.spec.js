"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../../../src/prisma/prisma.service");
const e2e_helpers_1 = require("../helpers/e2e.helpers");
describe('E2E - Workflow Import Transactions', () => {
    let app;
    let prisma;
    const context = {};
    const tokens = {};
    beforeAll(async () => {
        app = await (0, e2e_helpers_1.createTestApp)();
        prisma = app.get(prisma_service_1.PrismaService);
        await (0, e2e_helpers_1.cleanDatabase)(prisma);
        const seed = await (0, e2e_helpers_1.seedTestOrg)(prisma);
        context.periods = seed.periods;
        tokens.fpa = await (0, e2e_helpers_1.loginAs)(app, 'fpa@test.sn');
        tokens.contrib = await (0, e2e_helpers_1.loginAs)(app, 'contrib@test.sn');
    });
    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });
    it('ACTE 1 - Upload fichier Excel valide', async () => {
        const excelBuffer = await (0, e2e_helpers_1.generateTestExcel)([
            { account_code: '701000', amount: 5000000, department: 'VENTES', label: 'Ventes janvier' },
            { account_code: '601000', amount: 2000000, department: 'ACHATS', label: 'Achats janvier' },
        ]);
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post('/api/v1/imports/upload'), tokens.fpa)
            .attach('file', excelBuffer, {
            filename: 'import_janvier.xlsx',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
            .field('period_id', context.periods[0].id);
        expect(res.status).toBe(202);
        expect(res.body.data.status).toBe('PENDING');
        context.jobId = res.body.data.job_id;
    });
    it('ACTE 2 - Consulter le preview avant confirmation', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).get(`/api/v1/imports/${context.jobId}/preview`), tokens.fpa);
        expect(res.status).toBe(200);
        expect(res.body.data.rows).toHaveLength(2);
        expect(res.body.data.rows[0].account_code).toBe('701000');
    });
    it('ACTE 3 - Confirmer l\'import', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/imports/${context.jobId}/confirm`), tokens.fpa);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('PROCESSING');
    });
    it('ACTE 4 - Attendre le traitement et verifier DONE', async () => {
        const job = await (0, e2e_helpers_1.waitForJobStatus)(app, tokens.fpa, context.jobId, 'DONE', 30000);
        expect(job.status).toBe('DONE');
        expect(job.rows_inserted).toBe(2);
        expect(job.rows_skipped).toBe(0);
        const txCount = await prisma.transaction.count({ where: { import_job_id: context.jobId } });
        expect(txCount).toBe(2);
    });
    it('ACTE 5 - Rejeter fichier avec MIME invalide', async () => {
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post('/api/v1/imports/upload'), tokens.fpa)
            .attach('file', Buffer.from('fake pdf'), {
            filename: 'malicious.pdf',
            contentType: 'application/pdf',
        })
            .field('period_id', context.periods[0].id);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_FORMAT');
    });
    it('ACTE 6 - Rejeter fichier trop volumineux', async () => {
        const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post('/api/v1/imports/upload'), tokens.fpa)
            .attach('file', bigBuffer, {
            filename: 'too_big.xlsx',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
            .field('period_id', context.periods[0].id);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('FILE_TOO_LARGE');
    });
    it('ACTE 7 - CONTRIBUTEUR ne peut importer que son departement', async () => {
        const excelBuffer = await (0, e2e_helpers_1.generateTestExcel)([
            { account_code: '601000', amount: 500000, department: 'FINANCE', label: 'Charge finance' },
        ]);
        const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post('/api/v1/imports/upload'), tokens.contrib)
            .attach('file', excelBuffer, {
            filename: 'import.xlsx',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
            .field('period_id', context.periods[0].id)
            .field('department', 'FINANCE');
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('IMPORT_DEPT_FORBIDDEN');
    });
});
//# sourceMappingURL=import-workflow.e2e.spec.js.map