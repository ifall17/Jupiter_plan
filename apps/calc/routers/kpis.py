from decimal import Decimal

from fastapi import APIRouter

from models.schemas import KpiRequest
from services.kpi_calculator import KpiCalculator

router = APIRouter()
calculator = KpiCalculator()


@router.post("/calculate")
async def calculate_kpis(payload: KpiRequest):
    values = {
        "ca": Decimal("0"),
        "charges": Decimal("0"),
        "cash_balance": Decimal("0"),
        "monthly_burn_rate": Decimal("1"),
        "receivables": Decimal("0"),
    }
    kpis = calculator.calculate(str(payload.org_id), str(payload.period_id), values)
    alerts = calculator.detect_alerts(kpis)
    return {"kpis": {k: str(v) for k, v in kpis.items()}, "alerts": alerts}
