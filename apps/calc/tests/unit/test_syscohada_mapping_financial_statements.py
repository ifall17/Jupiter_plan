from decimal import Decimal
from typing import Any, Dict

import pytest

from utils.syscohada_mapping import compute_financial_statements


@pytest.mark.unit
def test_compute_financial_statements_normalizes_cr_bilan_and_flux_signs():
    transactions = [
        {'account_code': '701000', 'amount': '736000000'},
        {'account_code': '601000', 'amount': '-138800000'},
        {'account_code': '603100', 'amount': '0'},
        {'account_code': '411000', 'amount': '-12000000'},
        {'account_code': '401000', 'amount': '-15000000'},
        {'account_code': '521000', 'amount': '-3000000'},
    ]

    cash_flow_plans = [
        {'direction': 'IN', 'amount': '-10000000', 'flow_type': 'FINANCEMENT'},
        {'direction': 'OUT', 'amount': '-2500000', 'flow_type': 'DECAISSEMENT_EQUIPEMENT'},
        {'direction': 'OUT', 'amount': '-1000000', 'flow_type': 'DIVIDENDE'},
    ]

    fs: Dict[str, Any] = compute_financial_statements(transactions, cash_flow_plans)

    # CR values are positive magnitudes for expense lines and aggregate consistently.
    assert fs['is_data']['lines']['RA'] == '138800000'
    assert fs['is_data']['lines']['XA'] == '597200000'

    # Balance sheet lines are normalized in magnitude regardless of transaction sign.
    assert fs['bs_data']['actif']['BI'] == '12000000'
    assert fs['bs_data']['actif']['BS'] == '6500000'
    assert fs['bs_data']['passif']['EC'] == '15000000'

    # Cash flow plans are interpreted by direction/type with normalized amounts.
    assert fs['cf_data']['lines']['ZC'] == '-2500000'
    assert fs['cf_data']['lines']['ZF'] == '9000000'


@pytest.mark.unit
def test_compute_financial_statements_keeps_previous_treasury_rollforward():
    fs: Dict[str, Any] = compute_financial_statements(
        transactions=[],
        cash_flow_plans=[
            {'direction': 'IN', 'amount': '1000', 'flow_type': 'FINANCEMENT'},
            {'direction': 'OUT', 'amount': '200', 'flow_type': 'DIVIDENDE'},
        ],
        previous_balances={'tresorerie': '5000'},
    )

    za = Decimal(fs['cf_data']['lines']['ZA'])
    zg = Decimal(fs['cf_data']['lines']['ZG'])
    zh = Decimal(fs['cf_data']['lines']['ZH'])

    assert za == Decimal('5000')
    assert zh == za + zg
