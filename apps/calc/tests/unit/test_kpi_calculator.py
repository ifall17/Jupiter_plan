"""
Tests unitaires du moteur KPI.
"""

from decimal import Decimal
from unittest.mock import patch

import pytest

from services.kpi_calculator import KpiCalculator


class TestKpiCalculator:
    @pytest.fixture
    def calculator(self):
        return KpiCalculator()

    @pytest.mark.unit
    def test_calculates_ca_correctly(self, calculator):
        result = calculator.calculate(
            'org-1',
            'period-1',
            {
                'ca': Decimal('55000000'),
                'charges': Decimal('30000000'),
                'cash_balance': Decimal('20000000'),
                'monthly_burn_rate': Decimal('5000000'),
                'receivables': Decimal('5000000'),
            },
        )
        assert result['ca'] == Decimal('55000000')
        assert isinstance(result['ca'], Decimal)

    @pytest.mark.unit
    def test_returns_zero_ca_when_missing(self, calculator):
        result = calculator.calculate('org-1', 'period-1', {})
        assert result['ca'] == Decimal('0')

    @pytest.mark.unit
    def test_calculates_ebitda_correctly(self, calculator):
        result = calculator.calculate(
            'org-1',
            'period-1',
            {'ca': Decimal('55000000'), 'charges': Decimal('30000000')},
        )
        assert result['ebitda'] == Decimal('25000000')

    @pytest.mark.unit
    def test_ebitda_can_be_negative(self, calculator):
        result = calculator.calculate(
            'org-1',
            'period-1',
            {'ca': Decimal('10000000'), 'charges': Decimal('15000000')},
        )
        assert result['ebitda'] == Decimal('-5000000')

    @pytest.mark.unit
    @pytest.mark.precision
    def test_calculates_margin_correctly(self, calculator):
        result = calculator.calculate(
            'org-1',
            'period-1',
            {'ca': Decimal('55000000'), 'charges': Decimal('30000000')},
        )
        assert result['marge'] == Decimal('45.45')

    @pytest.mark.unit
    def test_margin_is_zero_when_ca_is_zero(self, calculator):
        result = calculator.calculate(
            'org-1',
            'period-1',
            {'ca': Decimal('0'), 'charges': Decimal('10000')},
        )
        assert result['marge'] == Decimal('0')

    @pytest.mark.unit
    def test_calculates_runway_in_months_ratio(self, calculator):
        result = calculator.calculate(
            'org-1',
            'period-1',
            {'cash_balance': Decimal('20000000'), 'monthly_burn_rate': Decimal('5000000')},
        )
        assert result['runway'] == Decimal('4.00')

    @pytest.mark.unit
    def test_runway_returns_zero_when_no_burn(self, calculator):
        result = calculator.calculate(
            'org-1',
            'period-1',
            {'cash_balance': Decimal('20000000'), 'monthly_burn_rate': Decimal('0')},
        )
        assert result['runway'] == Decimal('0')

    @pytest.mark.unit
    def test_generates_critical_alert_when_margin_below_critical(self, calculator):
        alerts = calculator.detect_alerts({'marge': Decimal('3')})
        assert alerts[0]['severity'] == 'CRITICAL'

    @pytest.mark.unit
    def test_generates_warn_alert_when_margin_below_warn(self, calculator):
        alerts = calculator.detect_alerts({'marge': Decimal('7')})
        assert alerts[0]['severity'] == 'WARN'

    @pytest.mark.unit
    def test_no_alert_when_kpi_healthy(self, calculator):
        alerts = calculator.detect_alerts({'marge': Decimal('20')})
        assert len(alerts) == 0

    @pytest.mark.unit
    def test_logs_calculation_duration_without_sensitive_amount(self, calculator):
        with patch('services.kpi_calculator.logger') as mock_logger:
            calculator.calculate(
                org_id='org-1',
                period_id='period-1',
                values={'ca': Decimal('55000000'), 'charges': Decimal('30000000')},
            )
            logs = str(mock_logger.info.call_args_list)
            assert 'done in' in logs
            assert 'org:' in logs
