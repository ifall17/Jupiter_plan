from decimal import Decimal

from fastapi import APIRouter

from models.schemas import ScenarioRequest
from services.scenario_engine import ScenarioEngine

router = APIRouter()
engine = ScenarioEngine()


@router.post("/run")
async def run_scenario(payload: ScenarioRequest):
    base_values = {
        "is_revenue": Decimal("1000000"),
        "is_expenses": Decimal("650000"),
        "amortissements": Decimal("30000"),
        "taxes": Decimal("25000"),
        "assets": Decimal("2000000"),
        "liabilities": Decimal("1200000"),
        "cf_operating": Decimal("100000"),
        "cf_investing": Decimal("-50000"),
        "cf_financing": Decimal("20000"),
    }
    result = engine.run(
        org_id=str(payload.org_id),
        period_id=str(payload.period_id),
        base_values=base_values,
        hypotheses=[h.model_dump() for h in payload.hypotheses],
    )
    return {k: (str(v) if isinstance(v, Decimal) else v) for k, v in result.items()}
