"""
Tests integration de cloture de periode.
"""

from decimal import Decimal

import pytest
from sqlalchemy import text

from services.closing_service import ClosingService, PeriodHasPendingTxError
from services.snapshot_calculator import BalanceMismatchError


@pytest.mark.integration
class TestClosingIntegration:
    @pytest.fixture(autouse=True)
    async def setup(self, real_db_session, seed_test_data):
        self.db = real_db_session
        self.service = ClosingService()
        self.data = seed_test_data

    async def test_closes_period_successfully(self):
        values = {
            'is_revenue': Decimal('5000000'),
            'is_expenses': Decimal('2000000'),
            'amortissements': Decimal('200000'),
            'taxes': Decimal('100000'),
            'assets': Decimal('10000000'),
            'liabilities': Decimal('6000000'),
            'equity': Decimal('4000000'),
            'cash_balance': Decimal('8000000'),
            'monthly_burn_rate': Decimal('1000000'),
            'receivables': Decimal('1200000'),
        }

        result = await self.service.close_period(
            period_id=self.data['period_id'],
            org_id=self.data['org_id'],
            has_pending_transactions=False,
            financial_values=values,
        )

        assert result['status'] == 'CLOSED'
        assert result['period_id'] == self.data['period_id']

    async def test_raises_when_pending_transactions(self):
        with pytest.raises(PeriodHasPendingTxError):
            await self.service.close_period(
                period_id=self.data['period_id'],
                org_id=self.data['org_id'],
                has_pending_transactions=True,
                financial_values={},
            )

    async def test_rollback_on_balance_mismatch(self):
        values = {
            'is_revenue': Decimal('5000000'),
            'is_expenses': Decimal('2000000'),
            'amortissements': Decimal('200000'),
            'taxes': Decimal('100000'),
            'assets': Decimal('10000000'),
            'liabilities': Decimal('6000000'),
            'equity': Decimal('3000000'),
        }

        with pytest.raises(BalanceMismatchError):
            await self.service.close_period(
                period_id=self.data['unbalanced_period_id'],
                org_id=self.data['org_id'],
                has_pending_transactions=False,
                financial_values=values,
            )

        res = await self.db.execute(
            text('SELECT status FROM periods WHERE id = :id'),
            {'id': self.data['unbalanced_period_id']},
        )
        status = res.fetchone()[0]
        assert status == 'OPEN'
