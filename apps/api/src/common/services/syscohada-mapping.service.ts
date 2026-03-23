import { Injectable } from '@nestjs/common';
import { LineType } from '@prisma/client';
import { getReportLineTypeFromSyscohada, resolveSyscohadaFinancialMapping } from '../constants/syscohada-financial-mapping';
import { PrismaService } from '../../prisma/prisma.service';

type DbStatement = 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW' | 'OFF_BALANCE';
type DbSection =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE'
  | 'OPERATING'
  | 'INVESTING'
  | 'FINANCING'
  | 'OFF_BALANCE';
type DbPresentationRule =
  | 'FIXED_ASSET'
  | 'FIXED_LIABILITY'
  | 'FIXED_EQUITY'
  | 'INCOME_REVENUE'
  | 'INCOME_EXPENSE'
  | 'DYNAMIC_BY_BALANCE_SIGN'
  | 'MEMO_ONLY';

export type ReportLineTypeStrict = 'REVENUE' | 'EXPENSE' | 'OTHER';

export interface SyscohadaDbMappingRow {
  org_id: string | null;
  prefix: string;
  prefix_length: number;
  statement: DbStatement;
  section: DbSection;
  presentation_rule: DbPresentationRule;
  line_type_hint: LineType | null;
  is_active: boolean;
}

export interface ResolvedFinancialMapping {
  statement: DbStatement;
  section: DbSection;
  presentation_rule: DbPresentationRule;
  line_type_hint: LineType | null;
}

function normalizeStrictReportLineType(value: LineType | 'OTHER'): ReportLineTypeStrict {
  if (value === LineType.REVENUE || value === LineType.EXPENSE) {
    return value;
  }
  return 'OTHER';
}

function selectByPriority(accountCode: string, orgId: string, rows: SyscohadaDbMappingRow[]): SyscohadaDbMappingRow | null {
  const candidates = rows.filter((row) => row.is_active && accountCode.startsWith(row.prefix));
  if (candidates.length === 0) {
    return null;
  }

  const exactLength = accountCode.length;
  const orgRows = candidates.filter((row) => row.org_id === orgId);
  const systemRows = candidates.filter((row) => row.org_id === null);

  const exactOrg = orgRows.find((row) => row.prefix_length === exactLength && row.prefix === accountCode);
  if (exactOrg) {
    return exactOrg;
  }

  const exactSystem = systemRows.find((row) => row.prefix_length === exactLength && row.prefix === accountCode);
  if (exactSystem) {
    return exactSystem;
  }

  const longestOrg = orgRows.sort((left, right) => right.prefix_length - left.prefix_length)[0];
  if (longestOrg) {
    return longestOrg;
  }

  const longestSystem = systemRows.sort((left, right) => right.prefix_length - left.prefix_length)[0];
  return longestSystem ?? null;
}

export function resolveFinancialMappingFromRows(
  accountCode: string,
  orgId: string,
  rows: SyscohadaDbMappingRow[],
): ResolvedFinancialMapping | null {
  const normalizedCode = String(accountCode ?? '').trim();
  if (!/^\d{6,8}$/.test(normalizedCode)) {
    return null;
  }

  const resolved = selectByPriority(normalizedCode, orgId, rows);
  if (resolved) {
    return {
      statement: resolved.statement,
      section: resolved.section,
      presentation_rule: resolved.presentation_rule,
      line_type_hint: resolved.line_type_hint,
    };
  }

  const fallback = resolveSyscohadaFinancialMapping(normalizedCode);
  if (!fallback) {
    return null;
  }

  return {
    statement: fallback.statement,
    section: fallback.section,
    presentation_rule: fallback.presentationRule,
    line_type_hint: fallback.lineTypeHint === 'OTHER' ? null : fallback.lineTypeHint,
  };
}

export function resolveReportLineTypeFromRows(
  accountCode: string,
  amount: string,
  orgId: string,
  rows: SyscohadaDbMappingRow[],
): ReportLineTypeStrict {
  const normalizedCode = String(accountCode ?? '').trim();
  if (!/^\d{6,8}$/.test(normalizedCode)) {
    return 'OTHER';
  }

  const resolved = selectByPriority(normalizedCode, orgId, rows);
  if (!resolved) {
    return normalizeStrictReportLineType(getReportLineTypeFromSyscohada(normalizedCode, amount));
  }

  if (resolved.statement !== 'INCOME_STATEMENT') {
    return 'OTHER';
  }

  if (resolved.line_type_hint === LineType.REVENUE || resolved.line_type_hint === LineType.EXPENSE) {
    return resolved.line_type_hint;
  }

  if (resolved.presentation_rule === 'INCOME_REVENUE') {
    return 'REVENUE';
  }

  if (resolved.presentation_rule === 'INCOME_EXPENSE') {
    return 'EXPENSE';
  }

  const numericAmount = Number(amount);
  if (Number.isFinite(numericAmount)) {
    return numericAmount >= 0 ? 'REVENUE' : 'EXPENSE';
  }

  return normalizeStrictReportLineType(getReportLineTypeFromSyscohada(normalizedCode, amount));
}

@Injectable()
export class SyscohadaMappingService {
  constructor(private readonly prisma: PrismaService) {}

  private async getMappings(orgId: string): Promise<SyscohadaDbMappingRow[]> {
    return this.prisma.$queryRaw<SyscohadaDbMappingRow[]>`
      SELECT
        org_id,
        prefix,
        prefix_length,
        statement,
        section,
        presentation_rule,
        line_type_hint,
        is_active
      FROM syscohada_account_mappings
      WHERE is_active = true
        AND (org_id = ${orgId} OR org_id IS NULL)
    `;
  }

  async resolveSingleLineType(accountCode: string, amount: string, orgId: string): Promise<ReportLineTypeStrict> {
    const mappings = await this.getMappings(orgId);

    return resolveReportLineTypeFromRows(accountCode, amount, orgId, mappings);
  }

  async resolveReportLineTypes(
    orgId: string,
    inputs: Array<{ accountCode: string; amount: string }>,
  ): Promise<ReportLineTypeStrict[]> {
    if (inputs.length === 0) {
      return [];
    }

    const mappings = await this.getMappings(orgId);

    return inputs.map((item) => resolveReportLineTypeFromRows(item.accountCode, item.amount, orgId, mappings));
  }

  async resolveFinancialMappings(
    orgId: string,
    accountCodes: string[],
  ): Promise<Array<ResolvedFinancialMapping | null>> {
    if (accountCodes.length === 0) {
      return [];
    }

    const mappings = await this.getMappings(orgId);
    return accountCodes.map((accountCode) => resolveFinancialMappingFromRows(accountCode, orgId, mappings));
  }
}