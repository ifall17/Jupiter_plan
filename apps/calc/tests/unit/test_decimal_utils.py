"""
Tests de precision numerique pour les utilitaires Decimal.
"""

from decimal import Decimal

import pytest

from utils.decimal_utils import format_fcfa, safe_divide, to_decimal


class TestToDecimal:
    @pytest.mark.precision
    def test_converts_integer_to_decimal(self):
        value = 50000000
        result = to_decimal(value)
        assert result == Decimal('50000000')
        assert isinstance(result, Decimal)

    @pytest.mark.precision
    def test_converts_string_to_decimal(self):
        result = to_decimal('10500000.50')
        assert result == Decimal('10500000.50')

    @pytest.mark.precision
    def test_converts_float_via_string_for_precision(self):
        float_value = 0.1 + 0.2
        result = to_decimal(float_value)
        assert result == Decimal('0.30000000000000004')

    @pytest.mark.precision
    def test_returns_zero_for_invalid_value(self):
        assert to_decimal('not_a_number') == Decimal('0')
        assert to_decimal(None) == Decimal('0')
        assert to_decimal('') == Decimal('0')

    @pytest.mark.precision
    def test_handles_very_large_fcfa_amount(self):
        result = to_decimal('9999999999.99')
        assert result == Decimal('9999999999.99')

    @pytest.mark.precision
    def test_handles_negative_amount(self):
        result = to_decimal('-5000000')
        assert result == Decimal('-5000000')


class TestSafeDivide:
    @pytest.mark.precision
    def test_divides_correctly_with_decimal_precision(self):
        result = safe_divide(Decimal('55000000'), Decimal('50000000'))
        assert result == Decimal('1.10')

    @pytest.mark.precision
    def test_returns_zero_when_denominator_is_zero(self):
        result = safe_divide(Decimal('50000000'), Decimal('0'))
        assert result == Decimal('0')

    @pytest.mark.precision
    def test_rounds_with_half_up(self):
        result = safe_divide(Decimal('10'), Decimal('3'), precision=2)
        assert result == Decimal('3.33')

    @pytest.mark.precision
    def test_custom_precision(self):
        result = safe_divide(Decimal('1'), Decimal('3'), precision=4)
        assert result == Decimal('0.3333')

    @pytest.mark.precision
    def test_percentage_calculation(self):
        ebitda = Decimal('25000000')
        ca = Decimal('55000000')
        marge = safe_divide(ebitda, ca) * Decimal('100')
        assert marge == Decimal('45.45')


class TestFormatFCFA:
    def test_formats_large_amount(self):
        result = format_fcfa(Decimal('50000000'))
        assert result == '50,000,000 FCFA'

    def test_formats_zero(self):
        result = format_fcfa(Decimal('0'))
        assert result == '0 FCFA'
