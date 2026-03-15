import logging
import time
from dataclasses import dataclass
from decimal import Decimal

from utils.decimal_utils import safe_divide, to_decimal

logger = logging.getLogger("calc-engine.kpi")


@dataclass
class KpiThresholds:
    warn: Decimal
    critical: Decimal


class KpiCalculator:
    def __init__(self) -> None:
        self.default_margin_thresholds = KpiThresholds(warn=Decimal("10"), critical=Decimal("5"))

    def calculate(self, org_id: str, period_id: str, values: dict[str, Decimal]) -> dict[str, Decimal]:
        started = time.perf_counter()

        ca = to_decimal(values.get("ca", Decimal("0")))
        charges = to_decimal(values.get("charges", Decimal("0")))
        cash_balance = to_decimal(values.get("cash_balance", Decimal("0")))
        monthly_burn_rate = to_decimal(values.get("monthly_burn_rate", Decimal("0")))
        receivables = to_decimal(values.get("receivables", Decimal("0")))

        ebitda = ca - charges
        marge = safe_divide(ebitda * Decimal("100"), ca, precision=2)
        runway = safe_divide(cash_balance, monthly_burn_rate, precision=2)
        dso = safe_divide(receivables * Decimal("30"), ca, precision=2)

        if ca == Decimal("0"):
            logger.warning("kpi_division_by_zero org_id=%s period_id=%s", org_id, period_id)

        elapsed = time.perf_counter() - started
        logger.info("KPI calc done in %.2fs - org: %s period: %s", elapsed, org_id, period_id)

        return {
            "ca": ca,
            "charges": charges,
            "ebitda": ebitda,
            "marge": marge,
            "runway": runway,
            "dso": dso,
        }

    def detect_alerts(self, kpis: dict[str, Decimal]) -> list[dict[str, str]]:
        alerts: list[dict[str, str]] = []
        marge = kpis.get("marge", Decimal("0"))

        if marge <= self.default_margin_thresholds.critical:
            alerts.append({"severity": "CRITICAL", "metric": "marge", "value": str(marge)})
        elif marge <= self.default_margin_thresholds.warn:
            alerts.append({"severity": "WARN", "metric": "marge", "value": str(marge)})

        return alerts
