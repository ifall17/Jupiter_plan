import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  api,
  cleanDatabase,
  createTestApp,
  generateTestExcel,
  loginAs,
  seedTestOrg,
  waitForJobStatus,
  withAuth,
} from '../helpers/e2e.helpers';

describe('E2E - Workflow Import Transactions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const context: any = {};
  const tokens: Record<string, any> = {};

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);

    const seed = await seedTestOrg(prisma);
    context.periods = seed.periods;

    tokens.fpa = await loginAs(app, 'fpa@test.sn');
    tokens.contrib = await loginAs(app, 'contrib@test.sn');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('ACTE 1 - Upload fichier Excel valide', async () => {
    const excelBuffer = await generateTestExcel([
      { account_code: '701000', amount: 5000000, department: 'VENTES', label: 'Ventes janvier' },
      { account_code: '601000', amount: 2000000, department: 'ACHATS', label: 'Achats janvier' },
    ]);

    const res = await withAuth(api(app).post('/api/v1/imports/upload'), tokens.fpa)
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
    const res = await withAuth(api(app).get(`/api/v1/imports/${context.jobId}/preview`), tokens.fpa);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(2);
    expect(res.body.data.rows[0].account_code).toBe('701000');
  });

  it('ACTE 3 - Confirmer l\'import', async () => {
    const res = await withAuth(api(app).post(`/api/v1/imports/${context.jobId}/confirm`), tokens.fpa);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PROCESSING');
  });

  it('ACTE 4 - Attendre le traitement et verifier DONE', async () => {
    const job = await waitForJobStatus(app, tokens.fpa, context.jobId, 'DONE', 30000);
    expect(job.status).toBe('DONE');
    expect(job.rows_inserted).toBe(2);
    expect(job.rows_skipped).toBe(0);

    const txCount = await prisma.transaction.count({ where: { import_job_id: context.jobId } });
    expect(txCount).toBe(2);
  });

  it('ACTE 5 - Rejeter fichier avec MIME invalide', async () => {
    const res = await withAuth(api(app).post('/api/v1/imports/upload'), tokens.fpa)
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
    const res = await withAuth(api(app).post('/api/v1/imports/upload'), tokens.fpa)
      .attach('file', bigBuffer, {
        filename: 'too_big.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .field('period_id', context.periods[0].id);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('ACTE 7 - CONTRIBUTEUR ne peut importer que son departement', async () => {
    const excelBuffer = await generateTestExcel([
      { account_code: '601000', amount: 500000, department: 'FINANCE', label: 'Charge finance' },
    ]);

    const res = await withAuth(api(app).post('/api/v1/imports/upload'), tokens.contrib)
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
