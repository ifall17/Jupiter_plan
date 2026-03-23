import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

SYSCOHADA_CLASSES = {
    "1": "Sustainable resources accounts",
    "2": "Fixed assets accounts",
    "3": "Inventory accounts",
    "4": "Third-party accounts",
    "5": "Treasury accounts",
    "6": "Expense accounts",
    "7": "Revenue accounts",
    "8": "Other charges, income and memorandum accounts",
}


@dataclass(frozen=True)
class SyscohadaMappingEntry:
    prefix: str
    label: str
    statement: str
    section: str
    subsection: str
    normal_balance: str
    presentation_rule: str
    line_type_hint: str


def _build_entries(
    statement: str,
    section: str,
    normal_balance: str,
    presentation_rule: str,
    line_type_hint: str,
    rows: list[tuple[str, str, str]],
) -> list[SyscohadaMappingEntry]:
    return [
        SyscohadaMappingEntry(
            prefix=prefix,
            label=label,
            statement=statement,
            section=section,
            subsection=subsection,
            normal_balance=normal_balance,
            presentation_rule=presentation_rule,
            line_type_hint=line_type_hint,
        )
        for prefix, label, subsection in rows
    ]


SYSCOHADA_MAPPINGS = sorted(
    [
        *_build_entries(
            "BALANCE_SHEET",
            "EQUITY",
            "CREDIT",
            "FIXED_EQUITY",
            "OTHER",
            [
                ("10", "Capital", "equity_capital"),
                ("11", "Reserves", "equity_reserves"),
                ("12", "Report a nouveau", "equity_retained_earnings"),
                ("13", "Resultat net", "equity_current_result"),
                ("14", "Subventions et fonds assimiles", "equity_other_funds"),
            ],
        ),
        *_build_entries(
            "BALANCE_SHEET",
            "LIABILITY",
            "CREDIT",
            "FIXED_LIABILITY",
            "OTHER",
            [
                ("15", "Provisions pour risques et charges", "liability_provisions"),
                ("16", "Emprunts et dettes financieres", "liability_financial_debt"),
                ("17", "Dettes de credit-bail et dettes assimilees", "liability_lease_and_related"),
                ("18", "Comptes de liaison et internes", "liability_group_and_internal"),
                ("40", "Fournisseurs", "liability_trade_payables"),
                ("42", "Personnel", "liability_payroll"),
                ("43", "Organismes sociaux", "liability_social"),
                ("46", "Debiteurs et crediteurs divers", "liability_other_payables"),
                ("49", "Depreciations et provisions sur comptes de tiers", "liability_third_party_adjustments"),
            ],
        ),
        *_build_entries(
            "BALANCE_SHEET",
            "LIABILITY",
            "MIXED",
            "DYNAMIC_BY_BALANCE_SIGN",
            "OTHER",
            [
                ("44", "Etat et collectivites publiques", "liability_or_tax_receivable"),
                ("45", "Organismes internationaux", "liability_or_other_public"),
                ("47", "Comptes transitoires ou regularisation", "liability_or_temporary"),
                ("48", "Charges et produits constates d avance", "liability_or_deferral"),
                ("58", "Regies d avances et virements internes", "asset_or_liability_internal_cash"),
            ],
        ),
        *_build_entries(
            "BALANCE_SHEET",
            "ASSET",
            "DEBIT",
            "FIXED_ASSET",
            "CAPEX",
            [
                ("21", "Immobilisations incorporelles", "asset_intangible"),
                ("22", "Terrains", "asset_land"),
                ("23", "Batiments installations et agencements", "asset_buildings"),
                ("24", "Materiel", "asset_equipment"),
                ("25", "Avances et acomptes sur immobilisations", "asset_capex_advances"),
                ("26", "Titres de participation", "asset_financial_fixed_assets"),
                ("27", "Autres immobilisations financieres", "asset_other_financial_assets"),
            ],
        ),
        *_build_entries(
            "BALANCE_SHEET",
            "ASSET",
            "CREDIT",
            "FIXED_ASSET",
            "OTHER",
            [
                ("28", "Amortissements", "asset_accumulated_depreciation"),
                ("29", "Depreciations des immobilisations", "asset_impairment_fixed_assets"),
                ("39", "Depreciations des stocks", "asset_inventory_impairment"),
            ],
        ),
        *_build_entries(
            "BALANCE_SHEET",
            "ASSET",
            "DEBIT",
            "FIXED_ASSET",
            "OTHER",
            [
                ("31", "Marchandises", "asset_inventory_goods"),
                ("32", "Matieres premieres et fournitures liees", "asset_inventory_raw_materials"),
                ("33", "Autres approvisionnements", "asset_inventory_supplies"),
                ("34", "Produits en cours", "asset_inventory_wip"),
                ("35", "Services en cours", "asset_inventory_services_wip"),
                ("36", "Produits finis", "asset_inventory_finished_goods"),
                ("37", "Produits intermediaires et residuels", "asset_inventory_intermediate_goods"),
                ("38", "Stocks en cours de route ou en consignation", "asset_inventory_in_transit"),
                ("41", "Clients", "asset_trade_receivables"),
                ("50", "Titres de placement", "asset_short_term_investments"),
                ("51", "Valeurs a encaisser", "asset_cash_in_collection"),
                ("52", "Banques", "asset_bank_accounts"),
                ("53", "Etablissements financiers et assimiles", "asset_financial_institutions"),
                ("54", "Instruments de tresorerie", "asset_treasury_instruments"),
                ("55", "Equivalents de tresorerie", "asset_cash_equivalents"),
                ("56", "Banques credits de tresorerie", "asset_cash_pooling"),
                ("57", "Caisses", "asset_cash_on_hand"),
            ],
        ),
        *_build_entries(
            "INCOME_STATEMENT",
            "EXPENSE",
            "DEBIT",
            "INCOME_EXPENSE",
            "EXPENSE",
            [
                ("60", "Achats et variations de stocks", "expense_purchases"),
                ("61", "Transports", "expense_transport"),
                ("62", "Services exterieurs", "expense_external_services"),
                ("63", "Impots et taxes", "expense_taxes"),
                ("64", "Autres charges", "expense_other_operating"),
                ("65", "Charges de personnel", "expense_payroll"),
                ("66", "Frais financiers et assimilables", "expense_financial"),
                ("67", "Charges exceptionnelles ou HAO", "expense_non_operating"),
                ("68", "Dotations aux amortissements et provisions", "expense_depreciation_provisions"),
                ("69", "Participation, impot resultat et assimilables", "expense_income_tax"),
            ],
        ),
        *_build_entries(
            "INCOME_STATEMENT",
            "REVENUE",
            "CREDIT",
            "INCOME_REVENUE",
            "REVENUE",
            [
                ("70", "Ventes", "revenue_sales"),
                ("71", "Subventions d exploitation", "revenue_operating_grants"),
                ("72", "Production immobilisee", "revenue_capitalized_production"),
                ("73", "Variations de stocks de produits", "revenue_inventory_variation"),
                ("74", "Autres produits", "revenue_other_operating"),
                ("75", "Transferts de charges", "revenue_cost_transfers"),
                ("76", "Produits financiers", "revenue_financial"),
                ("77", "Revenus exceptionnels ou HAO", "revenue_non_operating"),
                ("78", "Reprises amortissements et provisions", "revenue_reversals"),
                ("79", "Ajustements et reprises diverses", "revenue_adjustments"),
            ],
        ),
        *_build_entries(
            "OFF_BALANCE",
            "OFF_BALANCE",
            "MIXED",
            "MEMO_ONLY",
            "OTHER",
            [
                ("80", "Engagements hors bilan et memoire", "off_balance_commitments"),
                ("81", "Engagements accordes", "off_balance_guarantees_given"),
                ("82", "Engagements recus", "off_balance_guarantees_received"),
                ("83", "Contreparties engagements accordes", "off_balance_counterparty_given"),
                ("84", "Contreparties engagements recus", "off_balance_counterparty_received"),
                ("85", "Charges et produits sur exercices anterieurs", "off_balance_prior_period_adjustments"),
                ("86", "Autres comptes de memoire", "off_balance_memorandum"),
                ("87", "Ventilation complementaire", "off_balance_supplementary"),
                ("88", "Regularisations complementaires", "off_balance_adjustments"),
                ("89", "Soldes de cloture hors bilan", "off_balance_closing"),
            ],
        ),
    ],
    key=lambda entry: (-len(entry.prefix), entry.prefix),
)


def is_valid_syscohada(code: str) -> bool:
    normalized = str(code).strip() if code is not None else ""
    if not re.match(r"^\d{6,8}$", normalized):
        return False
    return normalized[0] in SYSCOHADA_CLASSES


def resolve_account_mapping(code: str) -> Optional[SyscohadaMappingEntry]:
    normalized = str(code).strip() if code is not None else ""
    if not is_valid_syscohada(normalized):
        return None

    for entry in SYSCOHADA_MAPPINGS:
        if normalized.startswith(entry.prefix):
            return entry
    return None


def get_line_type(code: str, amount: Optional[Decimal] = None) -> str:
    """Map SYSCOHADA account code to reporting line type."""
    mapping = resolve_account_mapping(code)
    if mapping is None:
        return "OTHER"

    if mapping.line_type_hint in {"REVENUE", "EXPENSE", "CAPEX"}:
        return mapping.line_type_hint

    if mapping.statement != "INCOME_STATEMENT":
        return "OTHER"

    if amount is not None:
      return "REVENUE" if amount >= Decimal("0") else "EXPENSE"

    return "OTHER"


def get_financial_statement(code: str) -> str:
    mapping = resolve_account_mapping(code)
    return mapping.statement if mapping is not None else "UNKNOWN"
