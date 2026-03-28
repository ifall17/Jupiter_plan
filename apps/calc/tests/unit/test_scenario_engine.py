"""
Tests unitaires du moteur de scenario.
"""

from decimal import Decimal

import pytest

from services.scenario_engine import ScenarioEngine


class TestScenarioEngine:
    @pytest.fixture
    def engine(self):
        return ScenarioEngine()

    @pytest.fixture
    def base_values(self):
        return {
            'is_revenue': Decimal('50000000'),
            'is_expenses': Decimal('20000000'),
            'amortissements': Decimal('1000000'),
            'taxes': Decimal('1000000'),
            'assets': Decimal('100000000'),
            'liabilities': Decimal('60000000'),
            'equity': Decimal('40000000'),
            'cf_operating': Decimal('1000000'),
            'cf_investing': Decimal('-500000'),
            'cf_financing': Decimal('200000'),
        }

    @pytest.mark.unit
    def test_applies_revenue_growth_percentage(self, engine, base_values):
        result = engine.run(
            org_id='org-1',
            period_id='period-1',
            base_values=base_values,
            hypotheses=[{'parameter': 'is_revenue', 'value': Decimal('20'), 'unit': '%'}],
        )
        assert result['is_revenue'] == Decimal('60000000')

    @pytest.mark.unit
    def test_applies_fcfa_addition(self, engine, base_values):
        result = engine.run(
            org_id='org-1',
            period_id='period-1',
            base_values=base_values,
            hypotheses=[{'parameter': 'is_expenses', 'value': Decimal('5000000'), 'unit': 'FCFA'}],
        )
        assert result['is_expenses'] == Decimal('25000000')

    @pytest.mark.unit
    def test_never_modifies_base_budget(self, engine, base_values):
        original_revenue = base_values['is_revenue']
        engine.run(
            org_id='org-1',
            period_id='period-1',
            base_values=base_values,
            hypotheses=[{'parameter': 'is_revenue', 'value': Decimal('50'), 'unit': '%'}],
        )
        assert base_values['is_revenue'] == original_revenue

    @pytest.mark.unit
    @pytest.mark.precision
    def test_decimal_precision_with_percentage(self, engine):
        result = engine.run(
            org_id='org-1',
            period_id='period-1',
            base_values={
                'is_revenue': Decimal('100000000'),
                'is_expenses': Decimal('1000000'),
                'amortissements': Decimal('0'),
                'taxes': Decimal('0'),
                'assets': Decimal('100000000'),
                'liabilities': Decimal('50000000'),
                'equity': Decimal('50000000'),
            },
            hypotheses=[{'parameter': 'is_revenue', 'value': Decimal('33.333333'), 'unit': '%'}],
        )
        assert isinstance(result['is_revenue'], Decimal)

    @pytest.mark.unit
    def test_apply_hypotheses_targets_only_matching_accounts(self, engine):
        budget_lines = [
            {'account_code': '701100', 'line_type': 'REVENUE', 'amount_budget': '1000.00'},
            {'account_code': '701200', 'line_type': 'REVENUE', 'amount_budget': '500.00'},
            {'account_code': '641000', 'line_type': 'EXPENSE', 'amount_budget': '300.00'},
            {'account_code': '625000', 'line_type': 'EXPENSE', 'amount_budget': '200.00'},
        ]

        adjusted = engine.apply_hypotheses(
            budget_lines,
            [
                {'parameter': 'revenue_growth', 'value': '10', 'unit': '%'},
                {'parameter': 'export_growth', 'value': '20', 'unit': '%'},
                {'parameter': 'payroll_increase', 'value': '10', 'unit': '%'},
            ],
        )

        by_code = {line['account_code']: Decimal(str(line['amount_budget'])) for line in adjusted}

        # 701100: +10% only (revenue_growth)
        assert by_code['701100'] == Decimal('1100.00')
        # 701200: +10% then +20% (both target this line)
        assert by_code['701200'] == Decimal('660.00')
        # payroll account targeted
        assert by_code['641000'] == Decimal('330.00')
        # non-targeted expense untouched
        assert by_code['625000'] == Decimal('200.00')

    @pytest.mark.unit
    def test_compute_net_result_uses_30_percent_is(self, engine):
        net = engine.compute_net_result(
            xg=Decimal('1000.00'),
            xh=Decimal('0.00'),
            rq=Decimal('0.00'),
        )

        assert net['is_amount'] == '300.00'
        assert net['XI'] == '700.00'
        assert net['taux_is'] == '30%'

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_calculate_scenario_applies_dso_dpo_only_to_bs_cf(self, engine):
        budget_lines = [
            {'account_code': '701200', 'line_type': 'REVENUE', 'amount_budget': '1000.00'},
            {'account_code': '601000', 'line_type': 'EXPENSE', 'amount_budget': '400.00'},
            {'account_code': '625000', 'line_type': 'EXPENSE', 'amount_budget': '100.00'},
        ]

        hypotheses = [
            {'parameter': 'dso_change', 'value': '45', 'unit': 'jours'},
            {'parameter': 'dpo_change', 'value': '30', 'unit': 'jours'},
        ]

        result = await engine.calculate_scenario(
            budget_lines=budget_lines,
            hypotheses=hypotheses,
            cash_flow_plans=[],
            org_id='org-1',
        )

        summary = result['summary']
        snapshots = result['snapshots']

        # DSO/DPO do not alter IS summary revenue/expenses/ebitda
        assert summary['revenue'] == '1000.00'
        assert summary['expenses'] == '500.00'
        assert summary['ebitda'] == '500.00'

        # DSO/DPO impact BI/EC and ZB
        assert snapshots['bs_data']['actif']['BI'] == '123.29'
        assert snapshots['bs_data']['passif']['EC'] == '32.88'
        assert 'ZB' in snapshots['cf_data']['lines']
