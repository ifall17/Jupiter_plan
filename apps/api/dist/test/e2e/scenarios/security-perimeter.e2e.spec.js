"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../../../src/prisma/prisma.service");
const e2e_helpers_1 = require("../helpers/e2e.helpers");
const jwt = require('jsonwebtoken');
describe('E2E - Perimetre de securite', () => {
    let app;
    let prisma;
    const context = {};
    const tokens = {};
    beforeAll(async () => {
        app = await (0, e2e_helpers_1.createTestApp)();
        prisma = app.get(prisma_service_1.PrismaService);
        await (0, e2e_helpers_1.cleanDatabase)(prisma);
        const seed = await (0, e2e_helpers_1.seedTestOrg)(prisma, { name: 'Main Org' });
        context.orgId = seed.org.id;
        context.fiscalYearId = seed.fiscalYear.id;
        context.userId = seed.users.admin.id;
        tokens.admin = await (0, e2e_helpers_1.loginAs)(app, 'admin@test.sn');
        tokens.fpa = await (0, e2e_helpers_1.loginAs)(app, 'fpa@test.sn');
        tokens.contrib = await (0, e2e_helpers_1.loginAs)(app, 'contrib@test.sn');
        tokens.lecteur = await (0, e2e_helpers_1.loginAs)(app, 'lecteur@test.sn');
    });
    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });
    describe('Isolation multi-tenant', () => {
        it('should never leak data between organizations', async () => {
            const orgA = await (0, e2e_helpers_1.seedTestOrg)(prisma, { name: 'Org A' });
            const orgB = await (0, e2e_helpers_1.seedTestOrg)(prisma, { name: 'Org B' });
            const { budget: budgetB } = await (0, e2e_helpers_1.seedTestBudget)(prisma, orgB.org.id, orgB.fiscalYear.id, 'APPROVED');
            const tokenA = await (0, e2e_helpers_1.loginAs)(app, orgA.users.fpa.email);
            const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).get(`/api/v1/budgets/${budgetB.id}`), tokenA);
            expect(res.status).toBe(404);
            expect(JSON.stringify(res.body)).not.toContain(orgB.org.id);
            expect(JSON.stringify(res.body)).not.toContain('Org B');
        });
        it('should ignore org_id query injection and keep JWT org scope', async () => {
            const otherOrg = await (0, e2e_helpers_1.seedTestOrg)(prisma, { name: 'Org Pirate' });
            const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).get('/api/v1/budgets').query({ org_id: otherOrg.org.id }), tokens.fpa);
            expect([200, 404]).toContain(res.status);
            const budgets = res.body?.data?.data ?? [];
            budgets.forEach((budget) => {
                expect(budget.org_id).toBe(context.orgId);
                expect(budget.org_id).not.toBe(otherOrg.org.id);
            });
        });
    });
    describe('Authentification', () => {
        it('should reject expired JWT', async () => {
            const expiredToken = (0, e2e_helpers_1.generateExpiredToken)(context.orgId);
            const res = await (0, e2e_helpers_1.api)(app)
                .get('/api/v1/budgets')
                .set('Authorization', `Bearer ${expiredToken}`);
            expect(res.status).toBe(401);
            expect(res.body.code).toBe('AUTH_003');
        });
        it('should reject JWT with alg:none', async () => {
            const maliciousToken = jwt.sign({ sub: 'attacker', org_id: context.orgId, role: 'SUPER_ADMIN' }, '', { algorithm: 'none' });
            const res = await (0, e2e_helpers_1.api)(app)
                .get('/api/v1/budgets')
                .set('Authorization', `Bearer ${maliciousToken}`);
            expect(res.status).toBe(401);
        });
        it('should reject JWT signed with wrong secret', async () => {
            const wrongToken = jwt.sign({ sub: 'attacker', org_id: context.orgId, role: 'SUPER_ADMIN' }, 'wrong-secret', { algorithm: 'HS256', expiresIn: '8h' });
            const res = await (0, e2e_helpers_1.api)(app)
                .get('/api/v1/budgets')
                .set('Authorization', `Bearer ${wrongToken}`);
            expect(res.status).toBe(401);
        });
    });
    describe('Elevation de privileges', () => {
        it('should block LECTEUR from creating budget', async () => {
            const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post('/api/v1/budgets'), tokens.lecteur).send({
                name: 'Budget Pirate',
                fiscal_year_id: context.fiscalYearId,
            });
            expect(res.status).toBe(403);
        });
        it('should block CONTRIBUTEUR from approving budget', async () => {
            const { budget } = await (0, e2e_helpers_1.seedTestBudget)(prisma, context.orgId, context.fiscalYearId, 'SUBMITTED');
            const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).post(`/api/v1/budgets/${budget.id}/approve`), tokens.contrib).send({});
            expect(res.status).toBe(403);
        });
        it('should block role escalation via body payload', async () => {
            const res = await (0, e2e_helpers_1.withAuth)((0, e2e_helpers_1.api)(app).patch('/api/v1/users/me'), tokens.contrib).send({
                role: 'SUPER_ADMIN',
            });
            expect([403, 404]).toContain(res.status);
        });
    });
    describe('Sensitive data exposure', () => {
        it('should never expose password_hash in key endpoints', async () => {
            const endpoints = [
                { method: 'get', path: '/api/v1/auth/me' },
                { method: 'get', path: '/api/v1/users' },
                { method: 'get', path: `/api/v1/users/${context.userId}` },
            ];
            for (const endpoint of endpoints) {
                const req = (0, e2e_helpers_1.api)(app)[endpoint.method](endpoint.path);
                const res = await (0, e2e_helpers_1.withAuth)(req, tokens.admin);
                expect(JSON.stringify(res.body)).not.toContain('password_hash');
            }
        });
        it('should never expose stack traces in error responses', async () => {
            const cases = [
                { method: 'get', path: '/api/v1/budgets/invalid-uuid' },
                { method: 'post', path: '/api/v1/budgets', body: { invalid: 'payload' } },
                { method: 'get', path: '/api/v1/nonexistent-route' },
            ];
            for (const c of cases) {
                const req = (0, e2e_helpers_1.api)(app)[c.method](c.path);
                const res = await (0, e2e_helpers_1.withAuth)(req, tokens.fpa).send(c.body);
                const body = JSON.stringify(res.body);
                expect(body).not.toContain('at Object.');
                expect(body).not.toContain('at Function.');
                expect(body).not.toContain('node_modules');
                expect(body).not.toContain('SELECT');
                expect(body).not.toContain('PrismaClientKnownRequestError');
            }
        });
    });
    describe('Rate limiting', () => {
        it('should block after 5 failed login attempts', async () => {
            for (let i = 0; i < 5; i += 1) {
                await (0, e2e_helpers_1.api)(app).post('/api/v1/auth/login').send({ email: 'fpa@test.sn', password: 'wrong' });
            }
            const res = await (0, e2e_helpers_1.api)(app).post('/api/v1/auth/login').send({
                email: 'fpa@test.sn',
                password: 'wrong',
            });
            expect(res.status).toBe(401);
            expect(res.body.code).toBe('AUTH_002');
        });
    });
});
//# sourceMappingURL=security-perimeter.e2e.spec.js.map