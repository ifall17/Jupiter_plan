CREATE TYPE "FinancialStatement" AS ENUM ('BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'OFF_BALANCE');
CREATE TYPE "FinancialSection" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'OPERATING', 'INVESTING', 'FINANCING', 'OFF_BALANCE');
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT', 'MIXED');
CREATE TYPE "MappingPresentationRule" AS ENUM ('FIXED_ASSET', 'FIXED_LIABILITY', 'FIXED_EQUITY', 'INCOME_REVENUE', 'INCOME_EXPENSE', 'DYNAMIC_BY_BALANCE_SIGN', 'MEMO_ONLY');

CREATE TABLE "syscohada_account_mappings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT,
    "prefix" VARCHAR(8) NOT NULL,
    "prefix_length" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "account_class" INTEGER NOT NULL,
    "statement" "FinancialStatement" NOT NULL,
    "section" "FinancialSection" NOT NULL,
    "subsection" VARCHAR(120),
    "normal_balance" "NormalBalance" NOT NULL,
    "presentation_rule" "MappingPresentationRule" NOT NULL,
    "line_type_hint" "LineType",
    "cash_flow_section" "FinancialSection",
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syscohada_account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "syscohada_account_mappings_org_id_is_active_idx" ON "syscohada_account_mappings"("org_id", "is_active");
CREATE INDEX "syscohada_account_mappings_prefix_length_prefix_idx" ON "syscohada_account_mappings"("prefix_length", "prefix");
CREATE UNIQUE INDEX "syscohada_account_mappings_org_id_prefix_statement_section_key"
ON "syscohada_account_mappings"("org_id", "prefix", "statement", "section");

ALTER TABLE "syscohada_account_mappings"
ADD CONSTRAINT "syscohada_account_mappings_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "syscohada_account_mappings"
    ("id", "org_id", "prefix", "prefix_length", "label", "account_class", "statement", "section", "subsection", "normal_balance", "presentation_rule", "line_type_hint", "cash_flow_section", "is_system", "is_active")
VALUES
    ('sys-10', NULL, '10', 2, 'Capital', 1, 'BALANCE_SHEET', 'EQUITY', 'equity_capital', 'CREDIT', 'FIXED_EQUITY', NULL, 'FINANCING', true, true),
    ('sys-11', NULL, '11', 2, 'Reserves', 1, 'BALANCE_SHEET', 'EQUITY', 'equity_reserves', 'CREDIT', 'FIXED_EQUITY', NULL, 'FINANCING', true, true),
    ('sys-12', NULL, '12', 2, 'Report a nouveau', 1, 'BALANCE_SHEET', 'EQUITY', 'equity_retained_earnings', 'CREDIT', 'FIXED_EQUITY', NULL, 'FINANCING', true, true),
    ('sys-13', NULL, '13', 2, 'Resultat net', 1, 'BALANCE_SHEET', 'EQUITY', 'equity_current_result', 'CREDIT', 'FIXED_EQUITY', NULL, 'FINANCING', true, true),
    ('sys-14', NULL, '14', 2, 'Subventions et fonds assimiles', 1, 'BALANCE_SHEET', 'EQUITY', 'equity_other_funds', 'CREDIT', 'FIXED_EQUITY', NULL, 'FINANCING', true, true),
    ('sys-15', NULL, '15', 2, 'Provisions pour risques et charges', 1, 'BALANCE_SHEET', 'LIABILITY', 'liability_provisions', 'CREDIT', 'FIXED_LIABILITY', NULL, 'OPERATING', true, true),
    ('sys-16', NULL, '16', 2, 'Emprunts et dettes financieres', 1, 'BALANCE_SHEET', 'LIABILITY', 'liability_financial_debt', 'CREDIT', 'FIXED_LIABILITY', NULL, 'FINANCING', true, true),
    ('sys-17', NULL, '17', 2, 'Dettes de credit-bail et dettes assimilees', 1, 'BALANCE_SHEET', 'LIABILITY', 'liability_lease_and_related', 'CREDIT', 'FIXED_LIABILITY', NULL, 'FINANCING', true, true),
    ('sys-18', NULL, '18', 2, 'Comptes de liaison et internes', 1, 'BALANCE_SHEET', 'LIABILITY', 'liability_group_and_internal', 'CREDIT', 'FIXED_LIABILITY', NULL, 'OPERATING', true, true),
    ('sys-21', NULL, '21', 2, 'Immobilisations incorporelles', 2, 'BALANCE_SHEET', 'ASSET', 'asset_intangible', 'DEBIT', 'FIXED_ASSET', 'CAPEX', 'INVESTING', true, true),
    ('sys-22', NULL, '22', 2, 'Terrains', 2, 'BALANCE_SHEET', 'ASSET', 'asset_land', 'DEBIT', 'FIXED_ASSET', 'CAPEX', 'INVESTING', true, true),
    ('sys-23', NULL, '23', 2, 'Batiments installations et agencements', 2, 'BALANCE_SHEET', 'ASSET', 'asset_buildings', 'DEBIT', 'FIXED_ASSET', 'CAPEX', 'INVESTING', true, true),
    ('sys-24', NULL, '24', 2, 'Materiel', 2, 'BALANCE_SHEET', 'ASSET', 'asset_equipment', 'DEBIT', 'FIXED_ASSET', 'CAPEX', 'INVESTING', true, true),
    ('sys-25', NULL, '25', 2, 'Avances et acomptes sur immobilisations', 2, 'BALANCE_SHEET', 'ASSET', 'asset_capex_advances', 'DEBIT', 'FIXED_ASSET', 'CAPEX', 'INVESTING', true, true),
    ('sys-26', NULL, '26', 2, 'Titres de participation', 2, 'BALANCE_SHEET', 'ASSET', 'asset_financial_fixed_assets', 'DEBIT', 'FIXED_ASSET', 'CAPEX', 'INVESTING', true, true),
    ('sys-27', NULL, '27', 2, 'Autres immobilisations financieres', 2, 'BALANCE_SHEET', 'ASSET', 'asset_other_financial_assets', 'DEBIT', 'FIXED_ASSET', 'CAPEX', 'INVESTING', true, true),
    ('sys-28', NULL, '28', 2, 'Amortissements', 2, 'BALANCE_SHEET', 'ASSET', 'asset_accumulated_depreciation', 'CREDIT', 'FIXED_ASSET', NULL, 'INVESTING', true, true),
    ('sys-29', NULL, '29', 2, 'Depreciations des immobilisations', 2, 'BALANCE_SHEET', 'ASSET', 'asset_impairment_fixed_assets', 'CREDIT', 'FIXED_ASSET', NULL, 'INVESTING', true, true),
    ('sys-31', NULL, '31', 2, 'Marchandises', 3, 'BALANCE_SHEET', 'ASSET', 'asset_inventory_goods', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-32', NULL, '32', 2, 'Matieres premieres et fournitures liees', 3, 'BALANCE_SHEET', 'ASSET', 'asset_inventory_raw_materials', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-33', NULL, '33', 2, 'Autres approvisionnements', 3, 'BALANCE_SHEET', 'ASSET', 'asset_inventory_supplies', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-34', NULL, '34', 2, 'Produits en cours', 3, 'BALANCE_SHEET', 'ASSET', 'asset_inventory_wip', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-35', NULL, '35', 2, 'Services en cours', 3, 'BALANCE_SHEET', 'ASSET', 'asset_inventory_services_wip', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-36', NULL, '36', 2, 'Produits finis', 3, 'BALANCE_SHEET', 'ASSET', 'asset_inventory_finished_goods', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-37', NULL, '37', 2, 'Produits intermediaires et residuels', 3, 'BALANCE_SHEET', 'ASSET', 'asset_inventory_intermediate_goods', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-38', NULL, '38', 2, 'Stocks en cours de route ou en consignation', 3, 'BALANCE_SHEET', 'ASSET', 'asset_inventory_in_transit', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-39', NULL, '39', 2, 'Depreciations des stocks', 3, 'BALANCE_SHEET', 'ASSET', 'asset_inventory_impairment', 'CREDIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-40', NULL, '40', 2, 'Fournisseurs', 4, 'BALANCE_SHEET', 'LIABILITY', 'liability_trade_payables', 'CREDIT', 'FIXED_LIABILITY', NULL, 'OPERATING', true, true),
    ('sys-41', NULL, '41', 2, 'Clients', 4, 'BALANCE_SHEET', 'ASSET', 'asset_trade_receivables', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-42', NULL, '42', 2, 'Personnel', 4, 'BALANCE_SHEET', 'LIABILITY', 'liability_payroll', 'CREDIT', 'FIXED_LIABILITY', NULL, 'OPERATING', true, true),
    ('sys-43', NULL, '43', 2, 'Organismes sociaux', 4, 'BALANCE_SHEET', 'LIABILITY', 'liability_social', 'CREDIT', 'FIXED_LIABILITY', NULL, 'OPERATING', true, true),
    ('sys-44', NULL, '44', 2, 'Etat et collectivites publiques', 4, 'BALANCE_SHEET', 'LIABILITY', 'liability_or_tax_receivable', 'MIXED', 'DYNAMIC_BY_BALANCE_SIGN', NULL, 'OPERATING', true, true),
    ('sys-45', NULL, '45', 2, 'Organismes internationaux', 4, 'BALANCE_SHEET', 'LIABILITY', 'liability_or_other_public', 'MIXED', 'DYNAMIC_BY_BALANCE_SIGN', NULL, 'OPERATING', true, true),
    ('sys-46', NULL, '46', 2, 'Debiteurs et crediteurs divers', 4, 'BALANCE_SHEET', 'LIABILITY', 'liability_other_payables', 'CREDIT', 'FIXED_LIABILITY', NULL, 'OPERATING', true, true),
    ('sys-47', NULL, '47', 2, 'Comptes transitoires ou regularisation', 4, 'BALANCE_SHEET', 'LIABILITY', 'liability_or_temporary', 'MIXED', 'DYNAMIC_BY_BALANCE_SIGN', NULL, 'OPERATING', true, true),
    ('sys-48', NULL, '48', 2, 'Charges et produits constates d avance', 4, 'BALANCE_SHEET', 'LIABILITY', 'liability_or_deferral', 'MIXED', 'DYNAMIC_BY_BALANCE_SIGN', NULL, 'OPERATING', true, true),
    ('sys-49', NULL, '49', 2, 'Depreciations et provisions sur comptes de tiers', 4, 'BALANCE_SHEET', 'LIABILITY', 'liability_third_party_adjustments', 'CREDIT', 'FIXED_LIABILITY', NULL, 'OPERATING', true, true),
    ('sys-50', NULL, '50', 2, 'Titres de placement', 5, 'BALANCE_SHEET', 'ASSET', 'asset_short_term_investments', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-51', NULL, '51', 2, 'Valeurs a encaisser', 5, 'BALANCE_SHEET', 'ASSET', 'asset_cash_in_collection', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-52', NULL, '52', 2, 'Banques', 5, 'BALANCE_SHEET', 'ASSET', 'asset_bank_accounts', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-53', NULL, '53', 2, 'Etablissements financiers et assimiles', 5, 'BALANCE_SHEET', 'ASSET', 'asset_financial_institutions', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-54', NULL, '54', 2, 'Instruments de tresorerie', 5, 'BALANCE_SHEET', 'ASSET', 'asset_treasury_instruments', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-55', NULL, '55', 2, 'Equivalents de tresorerie', 5, 'BALANCE_SHEET', 'ASSET', 'asset_cash_equivalents', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-56', NULL, '56', 2, 'Banques credits de tresorerie', 5, 'BALANCE_SHEET', 'ASSET', 'asset_cash_pooling', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-57', NULL, '57', 2, 'Caisses', 5, 'BALANCE_SHEET', 'ASSET', 'asset_cash_on_hand', 'DEBIT', 'FIXED_ASSET', NULL, 'OPERATING', true, true),
    ('sys-58', NULL, '58', 2, 'Regies d avances et virements internes', 5, 'BALANCE_SHEET', 'LIABILITY', 'asset_or_liability_internal_cash', 'MIXED', 'DYNAMIC_BY_BALANCE_SIGN', NULL, 'OPERATING', true, true),
    ('sys-60', NULL, '60', 2, 'Achats et variations de stocks', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_purchases', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'OPERATING', true, true),
    ('sys-61', NULL, '61', 2, 'Transports', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_transport', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'OPERATING', true, true),
    ('sys-62', NULL, '62', 2, 'Services exterieurs', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_external_services', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'OPERATING', true, true),
    ('sys-63', NULL, '63', 2, 'Impots et taxes', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_taxes', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'OPERATING', true, true),
    ('sys-64', NULL, '64', 2, 'Autres charges', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_other_operating', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'OPERATING', true, true),
    ('sys-65', NULL, '65', 2, 'Charges de personnel', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_payroll', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'OPERATING', true, true),
    ('sys-66', NULL, '66', 2, 'Frais financiers et assimilables', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_financial', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'FINANCING', true, true),
    ('sys-67', NULL, '67', 2, 'Charges exceptionnelles ou HAO', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_non_operating', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'OPERATING', true, true),
    ('sys-68', NULL, '68', 2, 'Dotations aux amortissements et provisions', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_depreciation_provisions', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'OPERATING', true, true),
    ('sys-69', NULL, '69', 2, 'Participation, impot resultat et assimilables', 6, 'INCOME_STATEMENT', 'EXPENSE', 'expense_income_tax', 'DEBIT', 'INCOME_EXPENSE', 'EXPENSE', 'OPERATING', true, true),
    ('sys-70', NULL, '70', 2, 'Ventes', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_sales', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'OPERATING', true, true),
    ('sys-71', NULL, '71', 2, 'Subventions d exploitation', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_operating_grants', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'OPERATING', true, true),
    ('sys-72', NULL, '72', 2, 'Production immobilisee', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_capitalized_production', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'OPERATING', true, true),
    ('sys-73', NULL, '73', 2, 'Variations de stocks de produits', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_inventory_variation', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'OPERATING', true, true),
    ('sys-74', NULL, '74', 2, 'Autres produits', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_other_operating', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'OPERATING', true, true),
    ('sys-75', NULL, '75', 2, 'Transferts de charges', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_cost_transfers', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'OPERATING', true, true),
    ('sys-76', NULL, '76', 2, 'Produits financiers', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_financial', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'FINANCING', true, true),
    ('sys-77', NULL, '77', 2, 'Revenus exceptionnels ou HAO', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_non_operating', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'OPERATING', true, true),
    ('sys-78', NULL, '78', 2, 'Reprises amortissements et provisions', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_reversals', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'OPERATING', true, true),
    ('sys-79', NULL, '79', 2, 'Ajustements et reprises diverses', 7, 'INCOME_STATEMENT', 'REVENUE', 'revenue_adjustments', 'CREDIT', 'INCOME_REVENUE', 'REVENUE', 'OPERATING', true, true),
    ('sys-80', NULL, '80', 2, 'Engagements hors bilan et memoire', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_commitments', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true),
    ('sys-81', NULL, '81', 2, 'Engagements accordes', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_guarantees_given', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true),
    ('sys-82', NULL, '82', 2, 'Engagements recus', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_guarantees_received', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true),
    ('sys-83', NULL, '83', 2, 'Contreparties engagements accordes', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_counterparty_given', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true),
    ('sys-84', NULL, '84', 2, 'Contreparties engagements recus', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_counterparty_received', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true),
    ('sys-85', NULL, '85', 2, 'Charges et produits sur exercices anterieurs', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_prior_period_adjustments', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true),
    ('sys-86', NULL, '86', 2, 'Autres comptes de memoire', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_memorandum', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true),
    ('sys-87', NULL, '87', 2, 'Ventilation complementaire', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_supplementary', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true),
    ('sys-88', NULL, '88', 2, 'Regularisations complementaires', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_adjustments', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true),
    ('sys-89', NULL, '89', 2, 'Soldes de cloture hors bilan', 8, 'OFF_BALANCE', 'OFF_BALANCE', 'off_balance_closing', 'MIXED', 'MEMO_ONLY', NULL, NULL, true, true);