import { INestApplication, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

class PassThroughGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = {
      sub: 'user-1',
      org_id: 'org-1',
      role: 'FPA',
    };
    return true;
  }
}

async function buildXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow(['account_code', 'account_label', 'department', 'line_type', 'amount', 'transaction_date']);
  sheet.addRow(['701000', 'Ventes', 'VENTES', 'revenue', '5000', '2026-03-01']);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe('ImportsController multipart validation (integration)', () => {
  let app: INestApplication;
  const processImport = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [
        {
          provide: ImportsService,
          useValue: {
            processImport,
            getJob: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new PassThroughGuard())
      .overrideGuard(RolesGuard)
      .useValue(new PassThroughGuard())
      .overrideGuard(OrgGuard)
      .useValue(new PassThroughGuard())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    processImport.mockReset();
  });

  it('rejects invalid MIME before entering service', async () => {
    const res = await request(app.getHttpServer())
      .post('/imports/upload')
      .attach('file', Buffer.from('not an xlsx'), {
        filename: 'payload.pdf',
        contentType: 'application/pdf',
      })
      .field('period_id', 'period-1');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IMPORT_FILE_TYPE_INVALID');
    expect(processImport).not.toHaveBeenCalled();
  });

  it('accepts valid xlsx multipart and forwards to service', async () => {
    processImport.mockResolvedValue({
      job_id: 'job-1',
      status: 'PENDING',
      rows_inserted: 0,
      rows_skipped: 0,
      error_report: null,
    });

    const res = await request(app.getHttpServer())
      .post('/imports/upload')
      .attach('file', await buildXlsxBuffer(), {
        filename: 'import.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .field('period_id', 'period-1');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      job_id: 'job-1',
      status: 'PENDING',
    });
    expect(processImport).toHaveBeenCalledTimes(1);
  });
});
