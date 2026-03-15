import logging
import time
from decimal import Decimal
from typing import Dict, Optional, Union

from utils.decimal_utils import to_decimal

logger = logging.getLogger("calc-engine.snapshot")


class BalanceMismatchError(Exception):
    pass


class SnapshotCalculator:
    @staticmethod
    def build_upsert_identity(org_id: str, period_id: str, scenario_id: Optional[str]) -> Dict[str, Optional[str]]:
        return {
            "org_id": org_id,
            "period_id": period_id,
            "scenario_id": scenario_id,
        }

    def calculate(
        self,
        org_id: str,
        period_id: str,
        values: Dict[str, Decimal],
        scenario_id: Optional[str] = None,
    ) -> Dict[str, Union[Decimal, str, None]]:
        started = time.perf_counter()

        is_revenue = to_decimal(values.get("is_revenue", Decimal("0")))
        is_expenses = to_decimal(values.get("is_expenses", Decimal("0")))
        amortissements = to_decimal(values.get("amortissements", Decimal("0")))
        taxes = to_decimal(values.get("taxes", Decimal("0")))

        is_ebitda = is_revenue - is_expenses
        is_net = is_ebitda - amortissements - taxes

        assets = to_decimal(values.get("assets", Decimal("0")))
        liabilities = to_decimal(values.get("liabilities", Decimal("0")))
        if "equity" in values:
            equity = to_decimal(values.get("equity", Decimal("0")))
        else:
            equity = assets - liabilities

        if abs(assets - (liabilities + equity)) > Decimal("0.01"):
            raise BalanceMismatchError("BALANCE_MISMATCH")

        cf_operating = to_decimal(values.get("cf_operating", Decimal("0")))
        cf_investing = to_decimal(values.get("cf_investing", Decimal("0")))
        cf_financing = to_decimal(values.get("cf_financing", Decimal("0")))

        elapsed = time.perf_counter() - started
        logger.info("snapshot_calc_done org_id=%s period_id=%s duration_ms=%.2f", org_id, period_id, elapsed * 1000)

        return {
            **self.build_upsert_identity(org_id=org_id, period_id=period_id, scenario_id=scenario_id),
            "is_revenue": is_revenue,
            "is_expenses": is_expenses,
            "is_ebitda": is_ebitda,
            "is_net": is_net,
            "bs_assets": assets,
            "bs_liabilities": liabilities,
            "bs_equity": equity,
            "cf_operating": cf_operating,
            "cf_investing": cf_investing,
            "cf_financing": cf_financing,
        }
