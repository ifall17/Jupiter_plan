"""
Tests integration KPI avec PostgreSQL test.
"""

from decimal import Decimal

import pytest
from sqlalchemy import text

from services.kpi_calculator import KpiCalculator


@pytest.mark.integration
class TestKpiIntegration:
    @pytest.fixture(autouse=True)
    async def setup(self, real_db_session, seed_test_data):
        self.db = real_db_session
        self.data = seed_test_data
        self.calculator = KpiCalculator()

    async def test_calculates_kpis_from_real_db_values(self):
        rows = await self.db.execute(
            text(
                """
                SELECT account_code, amount
                FROM transactions
                WHERE period_id = :pid AND org_id = :org
                """
            ),
            {'pid': self.data['period_id'], 'org': self.data['org_id']},
        )
        values = {'ca': Decimal('0'), 'charges': Decimal('0')}
        for account_code, amount in rows.fetchall():
            if str(account_code).startswith('7'):
                values['ca'] += Decimal(str(amount))
            if str(account_code).startswith('6'):
                values['charges'] += Decimal(str(amount))

        result = self.calculator.calculate(
            org_id=self.data['org_id'],
            period_id=self.data['period_id'],
            values=values,
        )

        assert result['ca'] == Decimal('5000000')
        assert result['charges'] == Decimal('2000000')
        assert result['ebitda'] == Decimal('3000000')

    async def test_detects_critical_alert_from_real_values(self):
        alerts = self.calculator.detect_alerts({'marge': Decimal('3')})
        assert alerts[0]['severity'] == 'CRITICAL'
