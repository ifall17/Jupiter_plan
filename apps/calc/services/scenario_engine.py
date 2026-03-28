import logging
import time
import copy
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Union

from services.snapshot_calculator import SnapshotCalculator
from utils.decimal_utils import to_decimal
from utils.syscohada_mapping import (
    BILAN_ACTIF_AGGREGATS,
    BILAN_PASSIF_AGGREGATS,
    compute_financial_statements,
)

logger = logging.getLogger("calc-engine.scenario")


HYPOTHESIS_TARGETS = {
    'revenue_growth': {
        'line_types': ['REVENUE'],
        'account_prefixes': [],
        'applies_to': 'amount',
    },
    'export_growth': {
        'line_types': ['REVENUE'],
        'account_prefixes': ['7012', '7013', '7014'],
        'applies_to': 'amount',
    },
    'cost_reduction': {
        'line_types': ['EXPENSE'],
        'account_prefixes': ['601', '602', '604', '605'],
        'applies_to': 'amount',
        'inverse': True,
    },
    'payroll_increase': {
        'line_types': ['EXPENSE'],
        'account_prefixes': ['621', '622', '641', '642', '643', '644', '645', '646'],
        'applies_to': 'amount',
    },
    'defect_rate': {
        'line_types': ['EXPENSE'],
        'account_prefixes': ['601', '602', '604'],
        'applies_to': 'amount',
    },
    'capex_increase': {
        'line_types': ['EXPENSE'],
        'account_prefixes': ['215', '218', '241', '244', '245', '246', '247', '248'],
        'applies_to': 'amount',
        'is_absolute': True,
    },
    'marketing_increase': {
        'line_types': ['EXPENSE'],
        'account_prefixes': ['623', '624'],
        'applies_to': 'amount',
    },
    'overhead_reduction': {
        'line_types': ['EXPENSE'],
        'account_prefixes': ['625', '626', '627', '628'],
        'applies_to': 'amount',
        'inverse': True,
    },
}


PURCHASE_PREFIXES = ['601', '602', '604', '605']
TAUX_IS_SENEGAL = Decimal('0.30')
ZERO = Decimal('0')
MONEY_QUANT = Decimal('0.01')


class ScenarioEngine:
    def __init__(self) -> None:
        self.snapshot_calculator = SnapshotCalculator()

    def apply_hypotheses(
        self,
        budget_lines: List[Dict[str, Any]],
        hypotheses: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Applique les hypothèses sur une copie profonde des lignes budgétaires.
        """
        lines = copy.deepcopy(budget_lines)

        for hyp in hypotheses:
            param = str(hyp.get('parameter', ''))
            value = Decimal(str(hyp.get('value', 0)))
            unit = str(hyp.get('unit', '%'))

            target = HYPOTHESIS_TARGETS.get(param)
            if not target:
                continue

            for line in lines:
                if not self._line_matches_target(line, target):
                    continue

                current = Decimal(str(line.get('amount_budget', 0)))

                if target.get('is_absolute'):
                    new_amount = current + value
                elif unit == '%':
                    factor = value / Decimal('100')
                    if target.get('inverse'):
                        new_amount = current * (Decimal('1') - factor)
                    else:
                        new_amount = current * (Decimal('1') + factor)
                else:
                    new_amount = current + value

                line['amount_budget'] = str(
                    new_amount.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
                )

        return lines

    def _line_matches_target(
        self,
        line: Dict[str, Any],
        target: Dict[str, Any],
    ) -> bool:
        code = str(line.get('account_code', ''))
        line_type = str(line.get('line_type', ''))

        if target.get('line_types') and line_type not in target['line_types']:
            return False

        prefixes = target.get('account_prefixes', [])
        if not prefixes:
            return True

        return any(code.startswith(prefix) for prefix in prefixes)

    def apply_dso_dpo_to_snapshots(
        self,
        snapshots: Dict[str, Any],
        hypotheses: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Applique DSO / DPO sur Bilan et Cash-Flow sans modifier le CR.
        """
        dso = None
        dpo = None

        for hyp in hypotheses:
            parameter = str(hyp.get('parameter', ''))
            if parameter == 'dso_change':
                dso = Decimal(str(hyp.get('value', 0)))
            if parameter == 'dpo_change':
                dpo = Decimal(str(hyp.get('value', 0)))

        if dso is None and dpo is None:
            return snapshots

        is_data = snapshots.setdefault('is_data', {})
        bs_data = snapshots.setdefault('bs_data', {})
        actif = bs_data.setdefault('actif', {})
        passif = bs_data.setdefault('passif', {})
        cf_data = snapshots.setdefault('cf_data', {})
        cf_lines = cf_data.setdefault('lines', {})

        ca = Decimal(str(is_data.get('revenue', 0)))
        achats = Decimal(str(is_data.get('purchases', 0)))

        if dso is not None:
            creances = ca * (dso / Decimal('365'))
            actif['BI'] = str(creances.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))

        if dpo is not None:
            dettes = achats * (dpo / Decimal('365'))
            passif['EC'] = str(dettes.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))

        self._recompute_balance_totals(snapshots)

        creances_val = Decimal(str(actif.get('BI', 0)))
        dettes_val = Decimal(str(passif.get('EC', 0)))
        bfr = creances_val - dettes_val
        cf_data['bfr'] = str(bfr.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))

        zb = Decimal(str(cf_lines.get('ZB', cf_data.get('ZB', 0)))) - bfr
        zb_str = str(zb.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))
        cf_lines['ZB'] = zb_str
        cf_data['ZB'] = zb_str

        return snapshots

    def compute_net_result(
        self,
        xg: Decimal,
        xh: Decimal,
        rq: Decimal,
    ) -> Dict[str, str]:
        """
        Calcul du résultat net selon SYSCOHADA Sénégal.
        """
        resultat_fiscal = xg + xh - rq

        if resultat_fiscal > ZERO:
            is_amount = (resultat_fiscal * TAUX_IS_SENEGAL).quantize(
                MONEY_QUANT,
                rounding=ROUND_HALF_UP,
            )
        else:
            is_amount = ZERO

        resultat_net = resultat_fiscal - is_amount

        return {
            'resultat_fiscal': str(resultat_fiscal.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)),
            'is_amount': str(is_amount),
            'taux_is': '30%',
            'XI': str(resultat_net.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)),
        }

    def _build_snapshots(
        self,
        adjusted_lines: List[Dict[str, Any]],
        cash_flow_plans: List[Dict[str, Any]],
        net_result: Dict[str, str],
        org_id: str,
    ) -> Dict[str, Any]:
        transactions = [
            {
                'account_code': str(line.get('account_code', '')),
                'amount': str(line.get('amount_budget', 0)),
                'line_type': str(line.get('line_type', 'OTHER')),
            }
            for line in adjusted_lines
        ]

        snapshots = compute_financial_statements(
            transactions=transactions,
            cash_flow_plans=cash_flow_plans,
            previous_balances={},
        )

        revenue = sum(
            Decimal(str(line.get('amount_budget', 0)))
            for line in adjusted_lines
            if str(line.get('line_type', '')) == 'REVENUE'
        )
        expenses = sum(
            Decimal(str(line.get('amount_budget', 0)))
            for line in adjusted_lines
            if str(line.get('line_type', '')) == 'EXPENSE'
        )
        purchases = sum(
            Decimal(str(line.get('amount_budget', 0)))
            for line in adjusted_lines
            if str(line.get('line_type', '')) == 'EXPENSE'
            and any(str(line.get('account_code', '')).startswith(prefix) for prefix in PURCHASE_PREFIXES)
        )
        ebitda = revenue - expenses

        snapshots.setdefault('is_data', {})
        snapshots['is_data']['revenue'] = str(revenue.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))
        snapshots['is_data']['expenses'] = str(expenses.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))
        snapshots['is_data']['ebitda'] = str(ebitda.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))
        snapshots['is_data']['purchases'] = str(purchases.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))
        snapshots['is_data']['net_result'] = net_result['XI']
        snapshots['is_data'].setdefault('lines', {})
        snapshots['is_data']['lines']['XD'] = snapshots['is_data']['ebitda']
        snapshots['is_data']['lines']['RS'] = net_result['is_amount']
        snapshots['is_data']['lines']['XI'] = net_result['XI']

        snapshots.setdefault('bs_data', {})
        snapshots['bs_data'].setdefault('passif', {})
        snapshots['bs_data']['passif']['CI'] = net_result['XI']
        self._recompute_balance_totals(snapshots)

        snapshots.setdefault('cf_data', {})
        snapshots['cf_data'].setdefault('lines', {})
        if 'ZB' in snapshots['cf_data']['lines']:
            snapshots['cf_data']['ZB'] = snapshots['cf_data']['lines']['ZB']

        return snapshots

    def _recompute_balance_totals(self, snapshots: Dict[str, Any]) -> None:
        bs_data = snapshots.setdefault('bs_data', {})
        actif = bs_data.setdefault('actif', {})
        passif = bs_data.setdefault('passif', {})

        for ref, agg in BILAN_ACTIF_AGGREGATS.items():
            total = sum(Decimal(str(actif.get(item, 0))) for item in agg['refs'])
            actif[ref] = str(total.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))

        for ref, agg in BILAN_PASSIF_AGGREGATS.items():
            total = sum(Decimal(str(passif.get(item, 0))) for item in agg['refs'])
            passif[ref] = str(total.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))

        total_actif = Decimal(str(actif.get('BZ', 0)))
        total_passif = Decimal(str(passif.get('BZ_P', 0)))
        balance_diff = abs(total_actif - total_passif).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        bs_data['total_actif'] = str(total_actif.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))
        bs_data['total_passif'] = str(total_passif.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))
        bs_data['balance_diff'] = str(balance_diff)
        bs_data['is_balanced'] = balance_diff <= Decimal('0.01')

    async def calculate_scenario(
        self,
        budget_lines: List[Dict[str, Any]],
        hypotheses: List[Dict[str, Any]],
        cash_flow_plans: List[Dict[str, Any]],
        org_id: str,
    ) -> Dict[str, Any]:
        non_timing_hyps = [
            h for h in hypotheses
            if str(h.get('parameter', '')) not in ['dso_change', 'dpo_change']
        ]

        adjusted_lines = self.apply_hypotheses(budget_lines, non_timing_hyps)

        revenues = sum(
            Decimal(str(l.get('amount_budget', 0)))
            for l in adjusted_lines
            if l.get('line_type') == 'REVENUE'
        )
        expenses = sum(
            Decimal(str(l.get('amount_budget', 0)))
            for l in adjusted_lines
            if l.get('line_type') == 'EXPENSE'
        )
        ebitda = revenues - expenses

        net_result = self.compute_net_result(
            xg=ebitda,
            xh=ZERO,
            rq=ZERO,
        )

        snapshots = self._build_snapshots(
            adjusted_lines,
            cash_flow_plans,
            net_result,
            org_id,
        )

        snapshots = self.apply_dso_dpo_to_snapshots(snapshots, hypotheses)

        return {
            'adjusted_lines': adjusted_lines,
            'snapshots': snapshots,
            'summary': {
                'revenue': str(revenues.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)),
                'expenses': str(expenses.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)),
                'ebitda': str(ebitda.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)),
                'ebitda_margin': str(
                    ((ebitda / revenues) * Decimal('100')).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
                    if revenues > ZERO else ZERO
                ),
                'is_amount': net_result['is_amount'],
                'net_result': net_result['XI'],
            },
        }

    def run(
        self,
        org_id: str,
        period_id: str,
        base_values: Dict[str, Decimal],
        hypotheses: List[Dict[str, Union[str, int, float]]],
    ) -> Dict[str, Union[Decimal, str, None]]:
        started = time.perf_counter()
        simulated = dict(base_values)

        for hypothesis in hypotheses:
            parameter = str(hypothesis["parameter"])
            value = to_decimal(hypothesis.get("value", 0))
            unit = str(hypothesis.get("unit", "%"))
            base_value = to_decimal(simulated.get(parameter, Decimal("0")))

            if unit == "%":
                simulated[parameter] = base_value * (Decimal("1") + (value / Decimal("100")))
            elif unit == "FCFA":
                simulated[parameter] = base_value + value

        result = self.snapshot_calculator.calculate(org_id=org_id, period_id=period_id, values=simulated, scenario_id="SIMULATED")
        elapsed = time.perf_counter() - started
        logger.info("scenario_done org_id=%s period_id=%s duration_ms=%.2f hypotheses=%d", org_id, period_id, elapsed * 1000, len(hypotheses))
        return result
