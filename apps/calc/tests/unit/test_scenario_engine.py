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
