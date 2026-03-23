import logging
import time

from services.kpi_calculator import KpiCalculator
from services.snapshot_calculator import BalanceMismatchError, SnapshotCalculator

logger = logging.getLogger("calc-engine.closing")


class PeriodHasPendingTxError(Exception):
    pass


class ClosingService:
    def __init__(self) -> None:
        self.snapshot_calculator = SnapshotCalculator()
        self.kpi_calculator = KpiCalculator()

    async def close_period(
        self,
        org_id: str,
        period_id: str,
        has_pending_transactions: bool,
        financial_values: dict,
    ) -> dict:
        started = time.perf_counter()

        if has_pending_transactions:
            raise PeriodHasPendingTxError("PERIOD_HAS_PENDING_TRANSACTIONS")

        snapshot = self.snapshot_calculator.calculate(org_id=org_id, period_id=period_id, values=financial_values, scenario_id=None)
        _ = self.kpi_calculator.calculate(org_id=org_id, period_id=period_id, values=financial_values)

        elapsed = time.perf_counter() - started
        logger.info("period_closing_done org_id=%s period_id=%s duration_ms=%.2f", org_id, period_id, elapsed * 1000)

        if not snapshot:
            raise BalanceMismatchError("BALANCE_MISMATCH")

        return {
            "status": "CLOSED",
            "period_id": period_id,
            "snapshot": {
                "is_revenue": str(snapshot["is_revenue"]),
                "is_expenses": str(snapshot["is_expenses"]),
                "is_ebitda": str(snapshot["is_ebitda"]),
                "is_net": str(snapshot["is_net"]),
                "bs_assets": str(snapshot["bs_assets"]),
                "bs_liabilities": str(snapshot["bs_liabilities"]),
                "bs_equity": str(snapshot["bs_equity"]),
                "cf_operating": str(snapshot["cf_operating"]),
                "cf_investing": str(snapshot["cf_investing"]),
                "cf_financing": str(snapshot["cf_financing"]),
            },
        }
