from decimal import Decimal

from fastapi import APIRouter

from models.schemas import SnapshotRequest
from services.snapshot_calculator import SnapshotCalculator

router = APIRouter()
calculator = SnapshotCalculator()


@router.post("/calculate")
async def calculate_snapshot(payload: SnapshotRequest):
    values = {
        "is_revenue": Decimal("0"),
        "is_expenses": Decimal("0"),
        "amortissements": Decimal("0"),
        "taxes": Decimal("0"),
        "assets": Decimal("0"),
        "liabilities": Decimal("0"),
        "cf_operating": Decimal("0"),
        "cf_investing": Decimal("0"),
        "cf_financing": Decimal("0"),
    }
    snapshot = calculator.calculate(
        org_id=str(payload.org_id),
        period_id=str(payload.period_id),
        values=values,
        scenario_id=str(payload.scenario_id) if payload.scenario_id else None,
    )
    return {k: (str(v) if isinstance(v, Decimal) else v) for k, v in snapshot.items()}
