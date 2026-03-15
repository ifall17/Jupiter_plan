"""
Tests de validation SYSCOHADA.
"""

import pytest

from utils.syscohada import get_line_type, is_valid_syscohada


class TestSYSCOHADAValidation:
    @pytest.mark.security
    @pytest.mark.parametrize(
        'code,expected',
        [
            ('701000', True),
            ('601000', True),
            ('521000', True),
            ('101000', True),
            ('99', False),
            ('ABC123', False),
            ('', False),
            ('9999999999', False),
            ('901000', False),
            (None, False),
        ],
    )
    def test_syscohada_validation(self, code, expected):
        assert is_valid_syscohada(code) == expected

    def test_revenue_code_returns_revenue_type(self):
        assert get_line_type('701000') == 'REVENUE'
        assert get_line_type('706000') == 'REVENUE'
        assert get_line_type('740000') == 'REVENUE'

    def test_expense_code_returns_expense_type(self):
        assert get_line_type('601000') == 'EXPENSE'
        assert get_line_type('621000') == 'EXPENSE'
        assert get_line_type('660000') == 'EXPENSE'

    def test_balance_code_returns_other_type(self):
        assert get_line_type('521000') == 'OTHER'
        assert get_line_type('411000') == 'OTHER'
        assert get_line_type('101000') == 'OTHER'
