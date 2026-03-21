import logging
import time
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Union

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


class EnrichedKpiCalculator:
    def __init__(self, transactions: list[Any], budget_lines: list[Any], cash_flow_plans: list[Any]) -> None:
        self.transactions = transactions
        self.budget_lines = budget_lines
        self.cash_flow_plans = cash_flow_plans

    def _sum(self, items: list[Any], key: str = "amount") -> Decimal:
        return sum((Decimal(str(getattr(i, key, 0) or 0)) for i in items), Decimal("0"))

    def _safe_div(self, a: Union[Decimal, int, float], b: Union[Decimal, int, float], precision: int = 2) -> Decimal:
        denominator = Decimal(str(b or 0))
        if denominator == 0:
            return Decimal("0")
        quantizer = Decimal("1") if precision <= 0 else Decimal("1").scaleb(-precision)
        return (Decimal(str(a)) / denominator).quantize(quantizer, rounding=ROUND_HALF_UP)

    def _account_starts_with(self, tx: Any, prefixes: tuple[str, ...]) -> bool:
        account_code = str(getattr(tx, "account_code", "") or "")
        return account_code.startswith(prefixes)

    def _is_revenue(self, tx: Any) -> bool:
        line_type = str(getattr(tx, "line_type", "") or "").upper()
        if line_type:
            return line_type == "REVENUE"
        return self._account_starts_with(tx, ("7",))

    def _is_expense(self, tx: Any) -> bool:
        line_type = str(getattr(tx, "line_type", "") or "").upper()
        if line_type:
            return line_type == "EXPENSE"
        return self._account_starts_with(tx, ("6",))

    # Profitability
    def gross_margin_pct(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        purchases = self._sum([t for t in self.transactions if self._account_starts_with(t, ("601", "602"))])
        if revenue == 0:
            return Decimal("0")
        return self._safe_div((revenue - purchases) * 100, revenue)

    def operating_margin_pct(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        expenses = self._sum([t for t in self.transactions if self._is_expense(t)])
        op_result = revenue - expenses
        return self._safe_div(op_result * 100, revenue)

    def ebitda_margin_pct(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        expenses = self._sum([t for t in self.transactions if self._is_expense(t)])
        ebitda = revenue - expenses
        return self._safe_div(ebitda * 100, revenue)

    def net_margin_pct(self) -> Decimal:
        return self.ebitda_margin_pct()

    def roe(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        expenses = self._sum([t for t in self.transactions if self._is_expense(t)])
        net = revenue - expenses
        equity = self._sum(self.budget_lines, "amount_budget")
        return self._safe_div(net * 100, equity)

    def roa(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        expenses = self._sum([t for t in self.transactions if self._is_expense(t)])
        net = revenue - expenses
        total_assets = self._sum(self.budget_lines, "amount_budget")
        return self._safe_div(net * 100, total_assets)

    # Activity
    def dso_days(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        receivables = revenue * Decimal("0.20")
        daily_revenue = self._safe_div(revenue, 365)
        return self._safe_div(receivables, daily_revenue, precision=0)

    def dpo_days(self) -> Decimal:
        purchases = self._sum([t for t in self.transactions if self._account_starts_with(t, ("601", "602"))])
        payables = purchases * Decimal("0.30")
        daily_purchases = self._safe_div(purchases, 365)
        return self._safe_div(payables, daily_purchases, precision=0)

    def asset_turnover(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        total_budget = self._sum(self.budget_lines, "amount_budget")
        return self._safe_div(revenue, total_budget)

    # Efficiency
    def cost_per_revenue(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        expenses = self._sum([t for t in self.transactions if self._is_expense(t)])
        return self._safe_div(expenses * 100, revenue)

    def opex_ratio(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        opex = self._sum([
            t for t in self.transactions if self._is_expense(t) and self._account_starts_with(t, ("62", "63", "64", "65"))
        ])
        return self._safe_div(opex * 100, revenue)

    def payroll_ratio(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        payroll = self._sum([t for t in self.transactions if self._account_starts_with(t, ("64",))])
        return self._safe_div(payroll * 100, revenue)

    def roce(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        expenses = self._sum([t for t in self.transactions if self._is_expense(t)])
        ebit = revenue - expenses
        capital = self._sum(self.budget_lines, "amount_budget")
        return self._safe_div(ebit * 100, capital)

    # Liquidity
    def current_ratio(self) -> Decimal:
        inflows = self._sum([p for p in self.cash_flow_plans if str(getattr(p, "direction", "") or "").upper() == "IN"])
        outflows = self._sum([p for p in self.cash_flow_plans if str(getattr(p, "direction", "") or "").upper() == "OUT"])
        return self._safe_div(inflows, outflows)

    def quick_ratio(self) -> Decimal:
        inflows = self._sum([p for p in self.cash_flow_plans if str(getattr(p, "direction", "") or "").upper() == "IN"])
        outflows = self._sum([p for p in self.cash_flow_plans if str(getattr(p, "direction", "") or "").upper() == "OUT"])
        quick_assets = inflows * Decimal("0.70")
        return self._safe_div(quick_assets, outflows)

    def cash_ratio(self) -> Decimal:
        inflows = self._sum([p for p in self.cash_flow_plans if str(getattr(p, "direction", "") or "").upper() == "IN"])
        outflows = self._sum([p for p in self.cash_flow_plans if str(getattr(p, "direction", "") or "").upper() == "OUT"])
        net = inflows - outflows
        return self._safe_div(net, outflows)

    def bfr(self) -> Decimal:
        revenue = self._sum([t for t in self.transactions if self._is_revenue(t)])
        purchases = self._sum([t for t in self.transactions if self._account_starts_with(t, ("601", "602"))])
        receivables = revenue * Decimal("0.20")
        payables = purchases * Decimal("0.30")
        return receivables - payables

    def runway_weeks(self) -> Decimal:
        inflows = self._sum([p for p in self.cash_flow_plans if str(getattr(p, "direction", "") or "").upper() == "IN"])
        outflows = self._sum([p for p in self.cash_flow_plans if str(getattr(p, "direction", "") or "").upper() == "OUT"])
        weekly_burn = self._safe_div(outflows, 13)
        net = inflows - outflows
        if weekly_burn == 0:
            return Decimal("0")
        return self._safe_div(net, weekly_burn, precision=0)

    def calculate_all(self) -> dict[str, str]:
        return {
            "CA": str(self._sum([t for t in self.transactions if self._is_revenue(t)])),
            "GROSS_MARGIN": str(self.gross_margin_pct()),
            "EBITDA_MARGIN": str(self.ebitda_margin_pct()),
            "OPERATING_MARGIN": str(self.operating_margin_pct()),
            "NET_MARGIN": str(self.net_margin_pct()),
            "ROE": str(self.roe()),
            "ROA": str(self.roa()),
            "DSO": str(self.dso_days()),
            "DPO": str(self.dpo_days()),
            "ASSET_TURNOVER": str(self.asset_turnover()),
            "COST_PER_REVENUE": str(self.cost_per_revenue()),
            "OPEX_RATIO": str(self.opex_ratio()),
            "PAYROLL_RATIO": str(self.payroll_ratio()),
            "ROCE": str(self.roce()),
            "QUICK_RATIO": str(self.quick_ratio()),
            "CURRENT_RATIO": str(self.current_ratio()),
            "CASH_RATIO": str(self.cash_ratio()),
            "BFR": str(self.bfr()),
            "RUNWAY": str(self.runway_weeks()),
        }
