from fastapi import APIRouter

from models.schemas import ClosePeriodRequest
from services.closing_service import ClosingService

router = APIRouter()
service = ClosingService()


@router.post("/close")
async def close_period(payload: ClosePeriodRequest):
    result = await service.close_period(
        org_id=str(payload.org_id),
        period_id=str(payload.period_id),
        has_pending_transactions=payload.has_pending_transactions,
        financial_values=payload.financial_values,
    )
    return result
