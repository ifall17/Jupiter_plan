import { LineType } from '@prisma/client';

export type FinancialStatement = 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW' | 'OFF_BALANCE';
export type FinancialSection =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE'
  | 'OPERATING'
  | 'INVESTING'
  | 'FINANCING'
  | 'OFF_BALANCE';
export type NormalBalance = 'DEBIT' | 'CREDIT' | 'MIXED';
export type MappingPresentationRule =
  | 'FIXED_ASSET'
  | 'FIXED_LIABILITY'
  | 'FIXED_EQUITY'
  | 'INCOME_REVENUE'
  | 'INCOME_EXPENSE'
  | 'DYNAMIC_BY_BALANCE_SIGN'
  | 'MEMO_ONLY';
export type ReportLineType = LineType | 'OTHER';

export interface SyscohadaFinancialMapping {
  prefix: string;
  label: string;
  accountClass: number;
  statement: FinancialStatement;
  section: FinancialSection;
  subsection: string;
  normalBalance: NormalBalance;
  presentationRule: MappingPresentationRule;
  lineTypeHint: ReportLineType | null;
  cashFlowSection: Extract<FinancialSection, 'OPERATING' | 'INVESTING' | 'FINANCING'> | null;
}

function buildEntries(
  accountClass: number,
  statement: FinancialStatement,
  section: FinancialSection,
  normalBalance: NormalBalance,
  presentationRule: MappingPresentationRule,
  lineTypeHint: ReportLineType | null,
  cashFlowSection: Extract<FinancialSection, 'OPERATING' | 'INVESTING' | 'FINANCING'> | null,
  rows: Array<[prefix: string, label: string, subsection: string]>,
): SyscohadaFinancialMapping[] {
  return rows.map(([prefix, label, subsection]) => ({
    prefix,
    label,
    accountClass,
    statement,
    section,
    subsection,
    normalBalance,
    presentationRule,
    lineTypeHint,
    cashFlowSection,
  }));
}

const equityMappings = buildEntries(1, 'BALANCE_SHEET', 'EQUITY', 'CREDIT', 'FIXED_EQUITY', null, 'FINANCING', [
  ['10', 'Capital', 'equity_capital'],
  ['11', 'Reserves', 'equity_reserves'],
  ['12', 'Report a nouveau', 'equity_retained_earnings'],
  ['13', 'Resultat net', 'equity_current_result'],
  ['14', 'Subventions et fonds assimiles', 'equity_other_funds'],
]);

const liabilityMappings = [
  ...buildEntries(1, 'BALANCE_SHEET', 'LIABILITY', 'CREDIT', 'FIXED_LIABILITY', null, 'OPERATING', [
    ['15', 'Provisions pour risques et charges', 'liability_provisions'],
    ['16', 'Emprunts et dettes financieres', 'liability_financial_debt'],
    ['17', 'Dettes de credit-bail et dettes assimilees', 'liability_lease_and_related'],
    ['18', 'Comptes de liaison et internes', 'liability_group_and_internal'],
    ['40', 'Fournisseurs', 'liability_trade_payables'],
    ['42', 'Personnel', 'liability_payroll'],
    ['43', 'Organismes sociaux', 'liability_social'],
    ['46', 'Debiteurs et crediteurs divers', 'liability_other_payables'],
    ['49', 'Depreciations et provisions sur comptes de tiers', 'liability_third_party_adjustments'],
  ]),
  ...buildEntries(4, 'BALANCE_SHEET', 'LIABILITY', 'MIXED', 'DYNAMIC_BY_BALANCE_SIGN', null, 'OPERATING', [
    ['44', 'Etat et collectivites publiques', 'liability_or_tax_receivable'],
    ['45', 'Organismes internationaux', 'liability_or_other_public'],
    ['47', 'Comptes transitoires ou regularisation', 'liability_or_temporary'],
    ['48', 'Charges et produits constates d avance', 'liability_or_deferral'],
  ]),
];

const assetMappings = [
  ...buildEntries(2, 'BALANCE_SHEET', 'ASSET', 'DEBIT', 'FIXED_ASSET', LineType.CAPEX, 'INVESTING', [
    ['21', 'Immobilisations incorporelles', 'asset_intangible'],
    ['22', 'Terrains', 'asset_land'],
    ['23', 'Batiments installations et agencements', 'asset_buildings'],
    ['24', 'Materiel', 'asset_equipment'],
    ['25', 'Avances et acomptes sur immobilisations', 'asset_capex_advances'],
    ['26', 'Titres de participation', 'asset_financial_fixed_assets'],
    ['27', 'Autres immobilisations financieres', 'asset_other_financial_assets'],
  ]),
  ...buildEntries(2, 'BALANCE_SHEET', 'ASSET', 'CREDIT', 'FIXED_ASSET', null, 'INVESTING', [
    ['28', 'Amortissements', 'asset_accumulated_depreciation'],
    ['29', 'Depreciations des immobilisations', 'asset_impairment_fixed_assets'],
  ]),
  ...buildEntries(3, 'BALANCE_SHEET', 'ASSET', 'DEBIT', 'FIXED_ASSET', null, 'OPERATING', [
    ['31', 'Marchandises', 'asset_inventory_goods'],
    ['32', 'Matieres premieres et fournitures liees', 'asset_inventory_raw_materials'],
    ['33', 'Autres approvisionnements', 'asset_inventory_supplies'],
    ['34', 'Produits en cours', 'asset_inventory_wip'],
    ['35', 'Services en cours', 'asset_inventory_services_wip'],
    ['36', 'Produits finis', 'asset_inventory_finished_goods'],
    ['37', 'Produits intermediaires et residuels', 'asset_inventory_intermediate_goods'],
    ['38', 'Stocks en cours de route ou en consignation', 'asset_inventory_in_transit'],
  ]),
  ...buildEntries(3, 'BALANCE_SHEET', 'ASSET', 'CREDIT', 'FIXED_ASSET', null, 'OPERATING', [
    ['39', 'Depreciations des stocks', 'asset_inventory_impairment'],
  ]),
  ...buildEntries(4, 'BALANCE_SHEET', 'ASSET', 'DEBIT', 'FIXED_ASSET', null, 'OPERATING', [
    ['41', 'Clients', 'asset_trade_receivables'],
  ]),
  ...buildEntries(5, 'BALANCE_SHEET', 'ASSET', 'DEBIT', 'FIXED_ASSET', null, 'OPERATING', [
    ['50', 'Titres de placement', 'asset_short_term_investments'],
    ['51', 'Valeurs a encaisser', 'asset_cash_in_collection'],
    ['52', 'Banques', 'asset_bank_accounts'],
    ['53', 'Etablissements financiers et assimiles', 'asset_financial_institutions'],
    ['54', 'Instruments de tresorerie', 'asset_treasury_instruments'],
    ['55', 'Instruments de tresorerie equivalents', 'asset_cash_equivalents'],
    ['56', 'Banques credits de tresorerie', 'asset_cash_pooling'],
    ['57', 'Caisses', 'asset_cash_on_hand'],
  ]),
  ...buildEntries(5, 'BALANCE_SHEET', 'ASSET', 'MIXED', 'DYNAMIC_BY_BALANCE_SIGN', null, 'OPERATING', [
    ['58', 'Regies d avances et virements internes', 'asset_or_liability_internal_cash'],
  ]),
];

const expenseMappings = buildEntries(6, 'INCOME_STATEMENT', 'EXPENSE', 'DEBIT', 'INCOME_EXPENSE', LineType.EXPENSE, 'OPERATING', [
  ['60', 'Achats et variations de stocks', 'expense_purchases'],
  ['61', 'Transports', 'expense_transport'],
  ['62', 'Services exterieurs', 'expense_external_services'],
  ['63', 'Impots et taxes', 'expense_taxes'],
  ['64', 'Autres charges', 'expense_other_operating'],
  ['65', 'Charges de personnel', 'expense_payroll'],
  ['66', 'Frais financiers et assimilables', 'expense_financial'],
  ['67', 'Charges exceptionnelles ou HAO', 'expense_non_operating'],
  ['68', 'Dotations aux amortissements et provisions', 'expense_depreciation_provisions'],
  ['69', 'Participation, impot resultat et assimilables', 'expense_income_tax'],
]);

const revenueMappings = buildEntries(7, 'INCOME_STATEMENT', 'REVENUE', 'CREDIT', 'INCOME_REVENUE', LineType.REVENUE, 'OPERATING', [
  ['70', 'Ventes', 'revenue_sales'],
  ['71', 'Subventions d exploitation', 'revenue_operating_grants'],
  ['72', 'Production immobilisee', 'revenue_capitalized_production'],
  ['73', 'Variations de stocks de produits', 'revenue_inventory_variation'],
  ['74', 'Autres produits', 'revenue_other_operating'],
  ['75', 'Transferts de charges', 'revenue_cost_transfers'],
  ['76', 'Produits financiers', 'revenue_financial'],
  ['77', 'Revenus exceptionnels ou HAO', 'revenue_non_operating'],
  ['78', 'Reprises amortissements et provisions', 'revenue_reversals'],
  ['79', 'Ajustements et reprises diverses', 'revenue_adjustments'],
]);

const class8Mappings = buildEntries(8, 'OFF_BALANCE', 'OFF_BALANCE', 'MIXED', 'MEMO_ONLY', null, null, [
  ['80', 'Engagements hors bilan et memoire', 'off_balance_commitments'],
  ['81', 'Engagements accordes', 'off_balance_guarantees_given'],
  ['82', 'Engagements recus', 'off_balance_guarantees_received'],
  ['83', 'Contreparties engagements accordes', 'off_balance_counterparty_given'],
  ['84', 'Contreparties engagements recus', 'off_balance_counterparty_received'],
  ['85', 'Charges et produits sur exercices anterieurs', 'off_balance_prior_period_adjustments'],
  ['86', 'Autres comptes de memoire', 'off_balance_memorandum'],
  ['87', 'Ventilation complementaire', 'off_balance_supplementary'],
  ['88', 'Regularisations complementaires', 'off_balance_adjustments'],
  ['89', 'Soldes de cloture hors bilan', 'off_balance_closing'],
]);

export const SYSCOHADA_FINANCIAL_MAPPINGS: SyscohadaFinancialMapping[] = [
  ...equityMappings,
  ...liabilityMappings,
  ...assetMappings,
  ...expenseMappings,
  ...revenueMappings,
  ...class8Mappings,
].sort((left, right) => right.prefix.length - left.prefix.length || left.prefix.localeCompare(right.prefix));

export function resolveSyscohadaFinancialMapping(accountCode: string): SyscohadaFinancialMapping | null {
  const normalized = String(accountCode ?? '').trim();
  if (!/^\d{6,8}$/.test(normalized)) {
    return null;
  }

  return SYSCOHADA_FINANCIAL_MAPPINGS.find((entry) => normalized.startsWith(entry.prefix)) ?? null;
}

export function getReportLineTypeFromSyscohada(accountCode: string, amount?: string): ReportLineType {
  const mapping = resolveSyscohadaFinancialMapping(accountCode);
  if (!mapping) {
    return 'OTHER';
  }

  if (mapping.lineTypeHint && mapping.lineTypeHint !== 'OTHER') {
    return mapping.lineTypeHint;
  }

  if (mapping.statement !== 'INCOME_STATEMENT') {
    return 'OTHER';
  }

  if (mapping.presentationRule === 'INCOME_REVENUE') {
    return LineType.REVENUE;
  }

  if (mapping.presentationRule === 'INCOME_EXPENSE') {
    return LineType.EXPENSE;
  }

  if (typeof amount === 'string') {
    const normalized = Number(amount);
    if (Number.isFinite(normalized)) {
      return normalized >= 0 ? LineType.REVENUE : LineType.EXPENSE;
    }
  }

  return 'OTHER';
}

export function belongsToBalanceSheet(accountCode: string): boolean {
  return resolveSyscohadaFinancialMapping(accountCode)?.statement === 'BALANCE_SHEET';
}

export function belongsToIncomeStatement(accountCode: string): boolean {
  return resolveSyscohadaFinancialMapping(accountCode)?.statement === 'INCOME_STATEMENT';
}