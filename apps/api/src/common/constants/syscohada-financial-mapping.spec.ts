import { LineType } from '@prisma/client';
import {
  belongsToBalanceSheet,
  belongsToIncomeStatement,
  getReportLineTypeFromSyscohada,
  resolveSyscohadaFinancialMapping,
} from './syscohada-financial-mapping';

describe('syscohada-financial-mapping', () => {
  it('resolves balance sheet asset prefixes', () => {
    const mapping = resolveSyscohadaFinancialMapping('521000');
    expect(mapping).not.toBeNull();
    expect(mapping?.statement).toBe('BALANCE_SHEET');
    expect(mapping?.section).toBe('ASSET');
    expect(mapping?.subsection).toBe('asset_bank_accounts');
  });

  it('resolves income statement expense prefixes', () => {
    const mapping = resolveSyscohadaFinancialMapping('681000');
    expect(mapping).not.toBeNull();
    expect(mapping?.statement).toBe('INCOME_STATEMENT');
    expect(mapping?.section).toBe('EXPENSE');
    expect(getReportLineTypeFromSyscohada('681000')).toBe(LineType.EXPENSE);
  });

  it('classifies revenue prefixes without relying on amount sign', () => {
    expect(getReportLineTypeFromSyscohada('701000', '-4500.00')).toBe(LineType.REVENUE);
    expect(belongsToIncomeStatement('701000')).toBe(true);
    expect(belongsToBalanceSheet('701000')).toBe(false);
  });

  it('keeps balance sheet accounts out of P&L line typing', () => {
    expect(getReportLineTypeFromSyscohada('401000', '-1200.00')).toBe('OTHER');
    expect(belongsToBalanceSheet('401000')).toBe(true);
  });

  it('keeps class 8 accounts out of income statement classification', () => {
    const mapping = resolveSyscohadaFinancialMapping('801000');
    expect(mapping).not.toBeNull();
    expect(mapping?.statement).toBe('OFF_BALANCE');
    expect(belongsToIncomeStatement('801000')).toBe(false);
    expect(getReportLineTypeFromSyscohada('801000', '1200.00')).toBe('OTHER');
  });

  it('returns null or OTHER for invalid account codes', () => {
    expect(resolveSyscohadaFinancialMapping('ABC')).toBeNull();
    expect(getReportLineTypeFromSyscohada('ABC')).toBe('OTHER');
  });
});