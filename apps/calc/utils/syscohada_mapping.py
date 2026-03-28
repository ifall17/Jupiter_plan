from decimal import Decimal
from typing import Any, Callable, Dict, List, Optional, Tuple

TransactionPayload = Dict[str, Any]
CashFlowPayload = Dict[str, Any]
FinancialStatementsPayload = Dict[str, Any]

# ─── COMPTE DE RESULTAT ───────────────────────────────
# Format : REF -> (libelle, [prefixes comptes], signe)
CR_MAPPING: Dict[str, Tuple[str, List[str], str]] = {
    # Produits
    'TA': ('Ventes de marchandises', ['701'], '+'),
    'TB': ('Ventes de produits fabriques', ['702'], '+'),
    'TC': ('Travaux, services vendus', ['703', '706'], '+'),
    'TD': ('Produits accessoires', ['704', '705', '707', '708'], '+'),
    'TF': ('Production immobilisee', ['72'], '+'),
    'TG': ("Subventions d'exploitation", ['71', '74'], '+'),
    'TH': ('Autres produits', ['75'], '+'),
    'TI': ("Transferts de charges d'exploitation", ['781', '791'], '+'),
    'TJ': ("Reprises d'amortissements et provisions", ['798'], '+'),
    'TK': ('Revenus financiers et assimiles', ['771', '772', '773', '776', '778', '762'], '+'),
    'TL': ('Reprises provisions financieres', ['797'], '+'),
    'TM': ('Transferts charges financieres', ['796'], '+'),
    'TN': ("Produits cessions d'immobilisations", ['82'], '+'),
    'TO': ('Autres produits HAO', ['84', '86', '88'], '+'),

    # Charges
    'RA': ('Achats de marchandises', ['601'], '-'),
    'RB': ('Variation stocks marchandises', ['6031'], '-'),
    'RC': ('Achats matieres premieres', ['602'], '-'),
    'RD': ('Variation stocks matieres', ['6032'], '-'),
    'RE': ('Autres achats', ['604', '605'], '-'),
    'RF': ('Variation stocks autres approv.', ['6033'], '-'),
    'RG': ('Transports', ['625'], '-'),
    'RH': ('Services exterieurs', ['623', '624', '626', '627', '628'], '-'),
    'RI': ('Impots et taxes', ['63'], '-'),
    'RJ': ('Autres charges', ['65'], '-'),
    'RK': ('Charges de personnel', ['621', '622', '641', '642', '643', '644', '645', '646'], '-'),
    'RL': ('Dotations aux amortissements', ['681', '691'], '-'),
    'RM': ('Frais financiers', ['671', '672', '673', '674', '676', '677', '661', '662', '663'], '-'),
    'RN': ('Dotations provisions financieres', ['697'], '-'),
    'RO': ('Valeurs comptables cessions', ['81'], '-'),
    'RP': ('Autres charges HAO', ['83', '85', '87'], '-'),
    'RQ': ('Participation des travailleurs', ['87'], '-'),
    'RS': ('Impots sur le resultat', ['89'], '-'),
}

# Agregats en cascade SYSCOHADA
CR_AGGREGATS = {
    'XA': {
        'label': 'MARGE BRUTE SUR MARCHANDISES',
        'formula': lambda r: (
            r.get('TA', Decimal('0'))
            - r.get('RA', Decimal('0'))
            - r.get('RB', Decimal('0'))
        ),
    },
    'XB': {
        'label': "CHIFFRE D'AFFAIRES",
        'formula': lambda r: (
            r.get('XA', Decimal('0'))
            + r.get('TB', Decimal('0'))
            + r.get('TC', Decimal('0'))
            + r.get('TD', Decimal('0'))
        ),
    },
    'XC': {
        'label': 'VALEUR AJOUTEE',
        'formula': lambda r: (
            r.get('XB', Decimal('0'))
            + r.get('TE', Decimal('0'))
            + r.get('TF', Decimal('0'))
            + r.get('TG', Decimal('0'))
            + r.get('TH', Decimal('0'))
            + r.get('TI', Decimal('0'))
            - r.get('RC', Decimal('0'))
            - r.get('RD', Decimal('0'))
            - r.get('RE', Decimal('0'))
            - r.get('RF', Decimal('0'))
            - r.get('RG', Decimal('0'))
            - r.get('RH', Decimal('0'))
            - r.get('RI', Decimal('0'))
            - r.get('RJ', Decimal('0'))
        ),
    },
    'XD': {
        'label': "EXCEDENT BRUT D'EXPLOITATION (EBE)",
        'formula': lambda r: (
            r.get('XC', Decimal('0'))
            - r.get('RK', Decimal('0'))
        ),
    },
    'XE': {
        'label': "RESULTAT D'EXPLOITATION",
        'formula': lambda r: (
            r.get('XD', Decimal('0'))
            + r.get('TJ', Decimal('0'))
            - r.get('RL', Decimal('0'))
        ),
    },
    'XF': {
        'label': 'RESULTAT FINANCIER',
        'formula': lambda r: (
            r.get('TK', Decimal('0'))
            + r.get('TL', Decimal('0'))
            + r.get('TM', Decimal('0'))
            - r.get('RM', Decimal('0'))
            - r.get('RN', Decimal('0'))
        ),
    },
    'XG': {
        'label': 'RESULTAT DES ACTIVITES ORDINAIRES',
        'formula': lambda r: (
            r.get('XE', Decimal('0'))
            + r.get('XF', Decimal('0'))
        ),
    },
    'XH': {
        'label': 'RESULTAT HORS ACTIVITES ORDINAIRES',
        'formula': lambda r: (
            r.get('TN', Decimal('0'))
            + r.get('TO', Decimal('0'))
            - r.get('RO', Decimal('0'))
            - r.get('RP', Decimal('0'))
        ),
    },
    'XI': {
        'label': 'RESULTAT NET',
        'formula': lambda r: (
            r.get('XG', Decimal('0'))
            + r.get('XH', Decimal('0'))
            - r.get('RQ', Decimal('0'))
            - r.get('RS', Decimal('0'))
        ),
    },
}

# ─── BILAN ACTIF ──────────────────────────────────────
BILAN_ACTIF_MAPPING: Dict[str, Tuple[str, List[str], str]] = {
    # Actif immobilise
    'AE': ('Frais developpement et prospection', ['201', '202'], 'ACTIF_IMMO'),
    'AF': ('Brevets, licences, logiciels', ['211', '212', '213'], 'ACTIF_IMMO'),
    'AG': ('Fonds commercial et droit au bail', ['214'], 'ACTIF_IMMO'),
    'AH': ('Autres immobilisations incorporelles', ['216', '217'], 'ACTIF_IMMO'),
    'AJ': ('Terrains', ['221', '222'], 'ACTIF_IMMO'),
    'AK': ('Batiments', ['231', '232', '233'], 'ACTIF_IMMO'),
    'AL': ('Amenagements, agencements', ['234', '235'], 'ACTIF_IMMO'),
    'AM': ('Materiel, mobilier et actifs biologiques', ['215', '218', '244', '245', '246', '247', '248'], 'ACTIF_IMMO'),
    'AN': ('Materiel de transport', ['241', '242'], 'ACTIF_IMMO'),
    'AP': ('Avances sur immobilisations', ['251', '252'], 'ACTIF_IMMO'),
    'AR': ('Titres de participation', ['261', '262'], 'ACTIF_IMMO'),
    'AS': ('Autres immobilisations financieres', ['271', '272', '273', '274', '275', '276'], 'ACTIF_IMMO'),
    # Actif circulant
    'BB': ('Stocks et encours', ['31', '32', '33', '34', '35', '36', '37', '38'], 'ACTIF_CIRC'),
    'BH': ('Fournisseurs, avances versees', ['409'], 'ACTIF_CIRC'),
    'BI': ('Clients', ['411', '412', '413', '416', '417', '418'], 'ACTIF_CIRC'),
    'BJ': ('Autres creances', ['421', '422', '425', '431', '441', '451', '461', '462'], 'ACTIF_CIRC'),
    # Tresorerie actif
    'BQ': ('Titres de placement', ['501', '502', '503', '504', '505', '506'], 'TRESORERIE'),
    'BR': ('Valeurs a encaisser', ['511', '512', '513'], 'TRESORERIE'),
    'BS': ('Banques, cheques postaux, caisse', ['521', '531', '571', '572', '581'], 'TRESORERIE'),
}

BILAN_ACTIF_AGGREGATS = {
    'AZ': {
        'label': 'TOTAL ACTIF IMMOBILISE',
        'refs': ['AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AP', 'AQ', 'AR', 'AS'],
    },
    'BK': {
        'label': 'TOTAL ACTIF CIRCULANT',
        'refs': ['BA', 'BB', 'BG', 'BH', 'BI', 'BJ'],
    },
    'BT': {
        'label': 'TOTAL TRESORERIE ACTIF',
        'refs': ['BQ', 'BR', 'BS'],
    },
    'BZ': {
        'label': 'TOTAL GENERAL ACTIF',
        'refs': ['AZ', 'BK', 'BT', 'BU'],
    },
}

# ─── BILAN PASSIF ─────────────────────────────────────
BILAN_PASSIF_MAPPING: Dict[str, Tuple[str, List[str], str]] = {
    # Capitaux propres
    'CA': ('Capital social', ['101', '102', '103', '104', '105', '106', '107'], 'CAPITAUX'),
    'CB': ('Apporteurs capital non appele', ['109'], 'CAPITAUX'),
    'CD': ('Primes liees au capital', ['111', '112', '113'], 'CAPITAUX'),
    'CE': ('Ecarts de reevaluation', ['114'], 'CAPITAUX'),
    'CF': ('Reserves indisponibles', ['115', '116'], 'CAPITAUX'),
    'CG': ('Reserves libres', ['118'], 'CAPITAUX'),
    'CH': ('Report a nouveau', ['119'], 'CAPITAUX'),
    # CI = Resultat net -> calcule depuis CR (XI)
    'CJ': ("Subventions d'investissement", ['141', '142'], 'CAPITAUX'),
    'CK': ('Provisions reglementees', ['151', '152', '153'], 'CAPITAUX'),
    # Dettes financieres
    'DA': ('Emprunts et dettes financieres', ['161', '162', '163', '164', '165', '166', '167', '168'], 'DETTES_FIN'),
    'DB': ('Dettes de location acquisition', ['17'], 'DETTES_FIN'),
    'DC': ('Provisions risques et charges', ['191', '192', '193', '194', '195', '196'], 'DETTES_FIN'),
    # Passif circulant
    'EB': ('Clients, avances recues', ['419'], 'PASSIF_CIRC'),
    'EC': ("Fournisseurs d'exploitation", ['401', '402', '403', '404', '405', '406', '407', '408'], 'PASSIF_CIRC'),
    'ED': ('Dettes fiscales et sociales', ['431', '432', '433', '434', '441', '442', '443', '444', '445', '446', '447', '448'], 'PASSIF_CIRC'),
    'EE': ('Autres dettes', ['461', '462', '463', '464', '471', '472', '473', '474'], 'PASSIF_CIRC'),
    'EF': ('Provisions risques court terme', ['499', '599'], 'PASSIF_CIRC'),
    # Tresorerie passif
    'TB_P': ('Banques, credits escompte', ['561', '562'], 'TRESORERIE_PASSIF'),
    'TC_P': ('Banques, credits tresorerie', ['565', '566'], 'TRESORERIE_PASSIF'),
}

BILAN_PASSIF_AGGREGATS = {
    'CP': {
        'label': 'TOTAL CAPITAUX PROPRES',
        'refs': ['CA', 'CB', 'CD', 'CE', 'CF', 'CG', 'CH', 'CI', 'CJ', 'CK'],
    },
    'DF': {
        'label': 'TOTAL DETTES FINANCIERES',
        'refs': ['DA', 'DB', 'DC'],
    },
    'DG': {
        'label': 'TOTAL RESSOURCES STABLES',
        'refs': ['CP', 'DF'],
    },
    'EK': {
        'label': 'TOTAL PASSIF CIRCULANT',
        'refs': ['EB', 'EC', 'ED', 'EE', 'EF'],
    },
    'TT': {
        'label': 'TOTAL TRESORERIE PASSIF',
        'refs': ['TB_P', 'TC_P'],
    },
    'BZ_P': {
        'label': 'TOTAL GENERAL PASSIF',
        'refs': ['DG', 'EK', 'TT'],
    },
}

# ─── FLUX DE TRESORERIE ───────────────────────────────
FLUX_MAPPING = {
    'FF': ("Acquisitions immobilisations incorp.", ['201', '202', '211', '212', '213', '214', '215'], 'INVEST'),
    'FG': ("Acquisitions immobilisations corp.", ['221', '222', '231', '232', '241', '244', '245'], 'INVEST'),
    'FH': ("Acquisitions immobilisations fin.", ['261', '262', '271', '272'], 'INVEST'),
    'FI': ("Cessions immobilisations incorp/corp", ['82'], 'INVEST'),
    'FJ': ("Cessions immobilisations financieres", ['861', '862'], 'INVEST'),
    'FK': ('Augmentations de capital', ['101', '102', '111'], 'FINANCEMENT'),
    'FL': ("Subventions d'investissement recues", ['141'], 'FINANCEMENT'),
    'FM': ('Prelevements sur capital', ['109'], 'FINANCEMENT'),
    'FN': ('Dividendes verses', ['465'], 'FINANCEMENT'),
    'FO': ('Emprunts', ['161', '162', '163'], 'FINANCEMENT'),
    'FP': ('Autres dettes financieres', ['164', '165', '166', '167'], 'FINANCEMENT'),
    'FQ': ('Remboursements emprunts', ['161', '162', '163', '164', '165'], 'FINANCEMENT'),
}


def _sum_by_prefixes(transactions: List[TransactionPayload], prefixes: List[str]) -> Decimal:
    total = Decimal('0')
    for tx in transactions:
        code = str(tx.get('account_code', ''))
        if any(code.startswith(p) for p in prefixes):
            total += Decimal(str(tx.get('amount', 0)))
    return total


def _sum_positive_by_prefixes(transactions: List[TransactionPayload], prefixes: List[str]) -> Decimal:
    total = Decimal('0')
    for tx in transactions:
        code = str(tx.get('account_code', ''))
        if any(code.startswith(p) for p in prefixes):
            total += abs(Decimal(str(tx.get('amount', 0))))
    return total


def _sum_plan_amount(
    cash_flow_plans: List[CashFlowPayload],
    predicate: Callable[[CashFlowPayload], bool],
) -> Decimal:
    total = Decimal('0')
    for plan in cash_flow_plans:
        if predicate(plan):
            total += abs(Decimal(str(plan.get('amount', 0))))
    return total


def _sum_cr_line(transactions: List[TransactionPayload], prefixes: List[str], sign: str) -> Decimal:
    total = Decimal('0')
    for tx in transactions:
        code = str(tx.get('account_code', ''))
        if not any(code.startswith(p) for p in prefixes):
            continue

        amount = Decimal(str(tx.get('amount', 0)))

        # CR lines are expected as positive magnitudes.
        # Revenues keep signed behavior (credit notes can reduce revenues),
        # while charges are normalized to avoid double-negative in aggregates.
        if sign == '-':
            total += abs(amount)
        else:
            total += amount
    return total


def compute_financial_statements(
    transactions: List[TransactionPayload],
    cash_flow_plans: List[CashFlowPayload],
    previous_balances: Optional[Dict[str, Any]] = None,
) -> FinancialStatementsPayload:
    """
    Calcule les 3 etats financiers SYSCOHADA
    depuis les transactions et flux de tresorerie.

    Args:
        transactions:      liste des transactions
        cash_flow_plans:   liste des flux planifies
        previous_balances: soldes N-1 pour le bilan

    Returns:
        dict avec is_data, bs_data, cf_data
    """

    prev = previous_balances or {}

    # 1. Compte de resultat
    cr_values = {}
    for ref, (_label, prefixes, sign) in CR_MAPPING.items():
        cr_values[ref] = _sum_cr_line(transactions, prefixes, sign)

    for ref in ['XA', 'XB', 'XC', 'XD', 'XE', 'XF', 'XG', 'XH', 'XI']:
        if ref in CR_AGGREGATS:
            cr_values[ref] = CR_AGGREGATS[ref]['formula'](cr_values)

    # 2. Bilan actif
    bs_actif = {}
    for ref, (_label, prefixes, _kind) in BILAN_ACTIF_MAPPING.items():
        bs_actif[ref] = _sum_positive_by_prefixes(transactions, prefixes)

    in_flows = _sum_plan_amount(cash_flow_plans, lambda p: p.get('direction') == 'IN')
    out_flows = _sum_plan_amount(cash_flow_plans, lambda p: p.get('direction') == 'OUT')
    bs_actif['BS'] = max(bs_actif.get('BS', Decimal('0')), in_flows - out_flows)

    ca = cr_values.get('XB', Decimal('0'))
    if bs_actif.get('BI', Decimal('0')) == 0:
        bs_actif['BI'] = ca * Decimal('0.20')

    for ref, agg in BILAN_ACTIF_AGGREGATS.items():
        bs_actif[ref] = sum(bs_actif.get(r, Decimal('0')) for r in agg['refs'])

    # 2. Bilan passif
    bs_passif = {}
    for ref, (_label, prefixes, _kind) in BILAN_PASSIF_MAPPING.items():
        bs_passif[ref] = _sum_positive_by_prefixes(transactions, prefixes)

    bs_passif['CI'] = cr_values.get('XI', Decimal('0'))

    achats = cr_values.get('RA', Decimal('0'))
    if bs_passif.get('EC', Decimal('0')) == 0:
        bs_passif['EC'] = achats * Decimal('0.30')

    for ref, agg in BILAN_PASSIF_AGGREGATS.items():
        bs_passif[ref] = sum(bs_passif.get(r, Decimal('0')) for r in agg['refs'])

    total_actif = bs_actif.get('BZ', Decimal('0'))
    total_passif = bs_passif.get('BZ_P', Decimal('0'))
    balance_diff = abs(total_actif - total_passif)
    is_balanced = balance_diff <= Decimal('0.01')

    # 3. Flux de tresorerie
    net_result = cr_values.get('XI', Decimal('0'))
    dotations = cr_values.get('RL', Decimal('0'))
    reprises = cr_values.get('TJ', Decimal('0'))
    cafg = net_result + dotations - reprises

    variation_bfr = bs_actif.get('BI', Decimal('0')) - bs_passif.get('EC', Decimal('0'))
    zb = cafg - variation_bfr

    invest_out = _sum_plan_amount(
        cash_flow_plans,
        lambda p: p.get('flow_type') in ['INVESTISSEMENT', 'DECAISSEMENT_EQUIPEMENT'],
    )
    zc = -invest_out

    financement_in = _sum_plan_amount(
        cash_flow_plans,
        lambda p: p.get('flow_type') in ['FINANCEMENT', 'EMPRUNT'],
    )
    financement_out = _sum_plan_amount(
        cash_flow_plans,
        lambda p: p.get('flow_type') in ['REMBOURSEMENT', 'DIVIDENDE'],
    )
    zf = financement_in - financement_out

    zg = zb + zc + zf
    za = Decimal(str(prev.get('tresorerie', 0)))
    zh = za + zg

    cf_values = {
        'ZA': za,
        'FA': cafg,
        'ZB': zb,
        'ZC': zc,
        'ZF': zf,
        'ZG': zg,
        'ZH': zh,
    }

    return {
        'is_data': {
            'lines': {k: str(v) for k, v in cr_values.items()},
            'net_result': str(cr_values.get('XI', Decimal('0'))),
            'ebitda': str(cr_values.get('XD', Decimal('0'))),
            'revenue': str(cr_values.get('XB', Decimal('0'))),
        },
        'bs_data': {
            'actif': {k: str(v) for k, v in bs_actif.items()},
            'passif': {k: str(v) for k, v in bs_passif.items()},
            'is_balanced': is_balanced,
            'balance_diff': str(balance_diff),
            'total_actif': str(total_actif),
            'total_passif': str(total_passif),
        },
        'cf_data': {
            'lines': {k: str(v) for k, v in cf_values.items()},
            'net_cash': str(zg),
            'cafg': str(cafg),
        },
    }
