from decimal import Decimal
from typing import Any
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints
from typing_extensions import Annotated


AccountCode = Annotated[str, StringConstraints(pattern=r"^\d{6,8}$")]


class KpiRequest(BaseModel):
    org_id: UUID
    period_id: UUID


class SnapshotRequest(BaseModel):
    org_id: UUID
    period_id: UUID
    scenario_id: Optional[UUID] = None


class ScenarioHypothesis(BaseModel):
    parameter: str
    value: Decimal
    unit: str


class ScenarioRequest(BaseModel):
    org_id: UUID
    period_id: UUID
    budget_id: UUID
    hypotheses: list[ScenarioHypothesis]


class ClosePeriodRequest(BaseModel):
    org_id: UUID
    period_id: UUID


class ImportProcessRequest(BaseModel):
    job_id: UUID
    s3_key: str
    period_id: UUID
    org_id: UUID
    user_id: UUID


class ImportRow(BaseModel):
    period_id: UUID
    account_code: AccountCode
    account_label: str = Field(max_length=200)
    department: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(ge=0)


class ImportResult(BaseModel):
    inserted: int
    skipped: int
    errors: list[dict[str, Any]]
