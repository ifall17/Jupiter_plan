import { LineType } from '@prisma/client';
import { resolveReportLineTypeFromRows, SyscohadaDbMappingRow } from './syscohada-mapping.service';

describe('resolveReportLineTypeFromRows', () => {
  const orgId = 'org-1';

  it('prioritizes org exact code over system prefix', () => {
    const rows: SyscohadaDbMappingRow[] = [
      {
        org_id: null,
        prefix: '70',
        prefix_length: 2,
        statement: 'INCOME_STATEMENT',
        section: 'REVENUE',
        presentation_rule: 'INCOME_REVENUE',
        line_type_hint: LineType.REVENUE,
        is_active: true,
      },
      {
        org_id: orgId,
        prefix: '701000',
        prefix_length: 6,
        statement: 'INCOME_STATEMENT',
        section: 'EXPENSE',
        presentation_rule: 'INCOME_EXPENSE',
        line_type_hint: LineType.EXPENSE,
        is_active: true,
      },
    ];

    const lineType = resolveReportLineTypeFromRows('701000', '1000.00', orgId, rows);
    expect(lineType).toBe('EXPENSE');
  });

  it('keeps OFF_BALANCE accounts out of reporting line types', () => {
    const rows: SyscohadaDbMappingRow[] = [
      {
        org_id: null,
        prefix: '80',
        prefix_length: 2,
        statement: 'OFF_BALANCE',
        section: 'OFF_BALANCE',
        presentation_rule: 'MEMO_ONLY',
        line_type_hint: null,
        is_active: true,
      },
    ];

    const lineType = resolveReportLineTypeFromRows('801000', '2500.00', orgId, rows);
    expect(lineType).toBe('OTHER');
  });

  it('falls back to static SYSCOHADA mapping when db has no candidate', () => {
    const rows: SyscohadaDbMappingRow[] = [];
    expect(resolveReportLineTypeFromRows('701000', '-4500.00', orgId, rows)).toBe('REVENUE');
    expect(resolveReportLineTypeFromRows('601000', '1200.00', orgId, rows)).toBe('EXPENSE');
    expect(resolveReportLineTypeFromRows('521000', '9000.00', orgId, rows)).toBe('OTHER');
  });
});