import pytest

from utils.syscohada import get_financial_statement, get_line_type, is_valid_syscohada, resolve_account_mapping


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

    def test_should_resolve_balance_sheet_mapping(self):
        mapping = resolve_account_mapping('521000')
        assert mapping is not None
        assert mapping.statement == 'BALANCE_SHEET'
        assert mapping.section == 'ASSET'
        assert mapping.subsection == 'asset_bank_accounts'

    def test_should_resolve_income_statement_mapping(self):
        mapping = resolve_account_mapping('681000')
        assert mapping is not None
        assert mapping.statement == 'INCOME_STATEMENT'
        assert mapping.section == 'EXPENSE'
        assert get_financial_statement('681000') == 'INCOME_STATEMENT'
