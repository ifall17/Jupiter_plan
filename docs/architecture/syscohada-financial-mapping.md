# Mapping SYSCOHADA -> etats financiers

## Objectif

Ce document definit le referentiel de projection entre comptes SYSCOHADA et etats financiers pour Jupiter_Plan.

Le principe retenu est le suivant :

1. Le compte SYSCOHADA porte la classification comptable de reference.
2. Les etats financiers sont alimentes a partir de cette classification, pas a partir de l'objet metier brut.
3. Le mapping est prefixe-based avec resolution par plus long prefixe.
4. Les exceptions organisationnelles sont gerees par surcharge en base.

## Table de correspondance complete de base

| Prefixe | Famille | Etat cible | Section | Sous-section | Regle de presentation | Solde normal |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | Capital | Bilan | Capitaux propres | equity_capital | FIXED_EQUITY | CREDIT |
| 11 | Reserves | Bilan | Capitaux propres | equity_reserves | FIXED_EQUITY | CREDIT |
| 12 | Report a nouveau | Bilan | Capitaux propres | equity_retained_earnings | FIXED_EQUITY | CREDIT |
| 13 | Resultat net | Bilan | Capitaux propres | equity_current_result | FIXED_EQUITY | CREDIT |
| 14 | Subventions et fonds assimiles | Bilan | Capitaux propres | equity_other_funds | FIXED_EQUITY | CREDIT |
| 15 | Provisions pour risques et charges | Bilan | Passif | liability_provisions | FIXED_LIABILITY | CREDIT |
| 16 | Emprunts et dettes financieres | Bilan | Passif | liability_financial_debt | FIXED_LIABILITY | CREDIT |
| 17 | Credit-bail et dettes assimilees | Bilan | Passif | liability_lease_and_related | FIXED_LIABILITY | CREDIT |
| 18 | Liaison et comptes internes | Bilan | Passif | liability_group_and_internal | FIXED_LIABILITY | CREDIT |
| 21-27 | Immobilisations | Bilan | Actif | asset_intangible / asset_land / asset_buildings / asset_equipment / asset_capex_advances / asset_financial_fixed_assets / asset_other_financial_assets | FIXED_ASSET | DEBIT |
| 28-29 | Amortissements et depreciations immobilisations | Bilan | Actif | asset_accumulated_depreciation / asset_impairment_fixed_assets | FIXED_ASSET | CREDIT |
| 31-38 | Stocks | Bilan | Actif | asset_inventory_* | FIXED_ASSET | DEBIT |
| 39 | Depreciation des stocks | Bilan | Actif | asset_inventory_impairment | FIXED_ASSET | CREDIT |
| 40 | Fournisseurs | Bilan | Passif | liability_trade_payables | FIXED_LIABILITY | CREDIT |
| 41 | Clients | Bilan | Actif | asset_trade_receivables | FIXED_ASSET | DEBIT |
| 42 | Personnel | Bilan | Passif | liability_payroll | FIXED_LIABILITY | CREDIT |
| 43 | Organismes sociaux | Bilan | Passif | liability_social | FIXED_LIABILITY | CREDIT |
| 44-45 | Etat, collectivites, organismes publics | Bilan | Variable | liability_or_tax_receivable / liability_or_other_public | DYNAMIC_BY_BALANCE_SIGN | MIXED |
| 46 | Debiteurs et crediteurs divers | Bilan | Passif | liability_other_payables | FIXED_LIABILITY | CREDIT |
| 47-48 | Comptes transitoires, regularisation, produits/charges constates d'avance | Bilan | Variable | liability_or_temporary / liability_or_deferral | DYNAMIC_BY_BALANCE_SIGN | MIXED |
| 49 | Ajustements sur comptes de tiers | Bilan | Passif | liability_third_party_adjustments | FIXED_LIABILITY | CREDIT |
| 50-57 | Tresorerie et quasi-tresorerie | Bilan | Actif | asset_short_term_investments / asset_cash_* | FIXED_ASSET | DEBIT |
| 58 | Virements internes et regies d'avance | Bilan | Variable | asset_or_liability_internal_cash | DYNAMIC_BY_BALANCE_SIGN | MIXED |
| 60-69 | Charges | Compte de resultat | Charges | expense_* | INCOME_EXPENSE | DEBIT |
| 70-79 | Produits | Compte de resultat | Produits | revenue_* | INCOME_REVENUE | CREDIT |
| 80-89 | Hors bilan / memoire | Hors bilan | Memo | off_balance_* | MEMO_ONLY | MIXED |

## Regles metier bilan vs resultat

1. Une ecriture va au bilan si son compte principal appartient aux classes 1 a 5.
2. Une ecriture va au compte de resultat si son compte principal appartient aux classes 6 ou 7.
3. Les comptes 8x ne doivent pas polluer le bilan ni le compte de resultat principal. Ils restent dans un referentiel memo ou hors bilan tant qu'une regle metier plus fine n'est pas definie.
4. Les comptes 44x, 45x, 47x, 48x et 58x sont ambigus par prefixe seul. Leur cote actif/passif depend du sens du solde apres aggregation, pas du seul evenement source.
5. Les classes 2x representent une logique CAPEX dans Jupiter_Plan. Elles doivent etre preservees comme indicateur technique distinct du simple couple REVENUE/EXPENSE.
6. Le tableau de flux ne doit pas etre deduit uniquement du compte. Il doit combiner :
   - la classe comptable
   - la rubrique mappee
   - le type de mouvement metier si disponible
7. Un document source ne va jamais directement vers un etat financier. Il faut passer par une ligne comptable ou une balance par compte.

## Structure technique retenue

### 1. Referentiel code

Fichier canonical NestJS : apps/api/src/common/constants/syscohada-financial-mapping.ts

Ce referentiel expose :

1. la table de mapping prefixe -> etat -> section -> sous-section
2. la resolution par plus long prefixe
3. la conversion vers un line_type de reporting

Equivalent Python : apps/calc/utils/syscohada.py

### 2. Structure base de donnees

Table Prisma : syscohada_account_mappings

Colonnes principales :

1. prefix
2. prefix_length
3. account_class
4. statement
5. section
6. subsection
7. normal_balance
8. presentation_rule
9. line_type_hint
10. cash_flow_section
11. org_id nullable pour les surcharges organisationnelles

### 3. Resolution runtime

Ordre de resolution recommande :

1. surcharge organisationnelle la plus specifique
2. mapping systeme le plus specifique
3. fallback sur la classe 1 chiffre
4. fallback OTHER si aucun mapping

## Effet attendu dans le projet

1. Les rapports ne deduisent plus revenu/charge avec une heuristique sur le signe.
2. Les comptes de bilan ne sont plus injectes par erreur dans le compte de resultat.
3. Les classes 2x peuvent etre traitees comme CAPEX dans les analyses sans casser le reporting.
4. Les surcharges client deviennent possibles sans fork de code.

## Seconde passe implementee

La resolution des line types de reporting dans l'API suit maintenant l'ordre suivant :

1. mapping organisationnel exact (code 6-8)
2. mapping systeme exact (code 6-8)
3. mapping organisationnel prefixe (plus long prefixe)
4. mapping systeme prefixe (plus long prefixe)
5. fallback sur le referentiel statique en code

Implementation :

1. Service runtime : apps/api/src/common/services/syscohada-mapping.service.ts
2. Integration rapports : apps/api/src/modules/reports/reports.service.ts
3. Tests de priorite : apps/api/src/common/services/syscohada-mapping.service.spec.ts

## Limites connues

1. Le bilan final fiable doit idealement etre calcule a partir d'une balance agregee, pas d'une simple liste brute de mouvements.
2. Les comptes mixtes 44x/45x/47x/48x/58x demandent une regle de solde ou de contrepartie.
3. Le tableau de flux demande un mapping complementaire par type de mouvement, pas seulement par compte.