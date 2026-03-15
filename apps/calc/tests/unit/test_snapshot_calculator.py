"""
Tests unitaires SnapshotCalculator.
"""

from decimal import Decimal

import pytest

from services.snapshot_calculator import BalanceMismatchError, SnapshotCalculator


class TestSnapshotCalculator:
    @pytest.fixture
    def calculator(self):
        return SnapshotCalculator()

    @pytest.mark.unit
    def test_calculates_income_statement_correctly(self, calculator):
        snapshot = calculator.calculate(
            org_id='org-1',
            period_id='period-1',
            values={
                'is_revenue': Decimal('55000000'),
                'is_expenses': Decimal('30000000'),
                'amortissements': Decimal('2000000'),
                'taxes': Decimal('1000000'),
                'assets': Decimal('100000000'),
                'liabilities': Decimal('60000000'),
                'equity': Decimal('40000000'),
            },
        )
        assert snapshot['is_revenue'] == Decimal('55000000')
        assert snapshot['is_expenses'] == Decimal('30000000')
        assert snapshot['is_ebitda'] == Decimal('25000000')
        assert isinstance(snapshot['is_net'], Decimal)

    @pytest.mark.unit
    def test_validates_balance_sheet_equilibrium(self, calculator, balanced_snapshot):
        result = calculator.calculate(
            org_id='org-1',
            period_id='period-1',
            values={
                'is_revenue': Decimal('0'),
                'is_expenses': Decimal('0'),
                'amortissements': Decimal('0'),
                'taxes': Decimal('0'),
                'assets': balanced_snapshot['bs_assets'],
                'liabilities': balanced_snapshot['bs_liabilities'],
                'equity': balanced_snapshot['bs_equity'],
            },
        )
        assert result['bs_assets'] == Decimal('100000000')

    @pytest.mark.unit
    def test_raises_balance_mismatch_when_unbalanced(self, calculator):
        with pytest.raises(BalanceMismatchError) as exc:
            calculator.calculate(
                org_id='org-1',
                period_id='period-1',
                values={
                    'is_revenue': Decimal('0'),
                    'is_expenses': Decimal('0'),
                    'amortissements': Decimal('0'),
                    'taxes': Decimal('0'),
                    'assets': Decimal('100000000'),
                    'liabilities': Decimal('60000000'),
                    'equity': Decimal('35000000'),
                },
            )
        assert 'BALANCE_MISMATCH' in str(exc.value)

    @pytest.mark.unit
    @pytest.mark.precision
    def test_balance_tolerance_is_one_centime(self, calculator):
        result = calculator.calculate(
            org_id='org-1',
            period_id='period-1',
            values={
                'is_revenue': Decimal('0'),
                'is_expenses': Decimal('0'),
                'amortissements': Decimal('0'),
                'taxes': Decimal('0'),
                'assets': Decimal('100000000.00'),
                'liabilities': Decimal('60000000.00'),
                'equity': Decimal('39999999.99'),
            },
        )
        assert result['bs_equity'] == Decimal('39999999.99')

    @pytest.mark.unit
    @pytest.mark.precision
    def test_balance_raises_above_tolerance(self, calculator):
        with pytest.raises(BalanceMismatchError):
            calculator.calculate(
                org_id='org-1',
                period_id='period-1',
                values={
                    'is_revenue': Decimal('0'),
                    'is_expenses': Decimal('0'),
                    'amortissements': Decimal('0'),
                    'taxes': Decimal('0'),
                    'assets': Decimal('100000000.00'),
                    'liabilities': Decimal('60000000.00'),
                    'equity': Decimal('39999999.98'),
                },
            )

    @pytest.mark.unit
    def test_real_snapshot_has_null_scenario_id(self, calculator):
        snapshot = calculator.calculate(
            org_id='org-1',
            period_id='period-1',
            scenario_id=None,
            values={
                'is_revenue': Decimal('100'),
                'is_expenses': Decimal('80'),
                'amortissements': Decimal('5'),
                'taxes': Decimal('5'),
                'assets': Decimal('100'),
                'liabilities': Decimal('60'),
                'equity': Decimal('40'),
            },
        )
        assert snapshot['scenario_id'] is None

    @pytest.mark.unit
    def test_scenario_snapshot_has_scenario_id(self, calculator):
        scenario_id = 'test-scenario-uuid-0001'
        snapshot = calculator.calculate(
            org_id='org-1',
            period_id='period-1',
            scenario_id=scenario_id,
            values={
                'is_revenue': Decimal('100'),
                'is_expenses': Decimal('80'),
                'amortissements': Decimal('5'),
                'taxes': Decimal('5'),
                'assets': Decimal('100'),
                'liabilities': Decimal('60'),
                'equity': Decimal('40'),
            },
        )
        assert snapshot['scenario_id'] == scenario_id
