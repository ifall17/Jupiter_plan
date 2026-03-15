import logging
import time
from decimal import Decimal
from typing import Dict, List, Union

from services.snapshot_calculator import SnapshotCalculator
from utils.decimal_utils import to_decimal

logger = logging.getLogger("calc-engine.scenario")


class ScenarioEngine:
    def __init__(self) -> None:
        self.snapshot_calculator = SnapshotCalculator()

    def run(
        self,
        org_id: str,
        period_id: str,
        base_values: Dict[str, Decimal],
        hypotheses: List[Dict[str, Union[str, int, float]]],
    ) -> Dict[str, Union[Decimal, str, None]]:
        started = time.perf_counter()
        simulated = dict(base_values)

        for hypothesis in hypotheses:
            parameter = str(hypothesis["parameter"])
            value = to_decimal(hypothesis.get("value", 0))
            unit = str(hypothesis.get("unit", "%"))
            base_value = to_decimal(simulated.get(parameter, Decimal("0")))

            if unit == "%":
                simulated[parameter] = base_value * (Decimal("1") + (value / Decimal("100")))
            elif unit == "FCFA":
                simulated[parameter] = base_value + value

        result = self.snapshot_calculator.calculate(org_id=org_id, period_id=period_id, values=simulated, scenario_id="SIMULATED")
        elapsed = time.perf_counter() - started
        logger.info("scenario_done org_id=%s period_id=%s duration_ms=%.2f hypotheses=%d", org_id, period_id, elapsed * 1000, len(hypotheses))
        return result
