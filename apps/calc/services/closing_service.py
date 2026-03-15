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
    ) -> dict[str, str]:
        started = time.perf_counter()

        if has_pending_transactions:
            raise PeriodHasPendingTxError("PERIOD_HAS_PENDING_TRANSACTIONS")

        snapshot = self.snapshot_calculator.calculate(org_id=org_id, period_id=period_id, values=financial_values, scenario_id=None)
        _ = self.kpi_calculator.calculate(org_id=org_id, period_id=period_id, values=financial_values)

        elapsed = time.perf_counter() - started
        logger.info("period_closing_done org_id=%s period_id=%s duration_ms=%.2f", org_id, period_id, elapsed * 1000)

        if not snapshot:
            raise BalanceMismatchError("BALANCE_MISMATCH")

        return {"status": "CLOSED", "period_id": period_id}
