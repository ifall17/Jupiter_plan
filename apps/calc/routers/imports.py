from fastapi import APIRouter

from models.schemas import ImportProcessRequest
from services.import_processor import ImportProcessor

router = APIRouter()


class _NoopS3:
    async def get_object(self, _key: str):
        return None

    async def delete_object(self, _key: str):
        return None


processor = ImportProcessor(s3_service=_NoopS3())


@router.post("/process")
async def process_import(payload: ImportProcessRequest):
    result = await processor.process(payload.s3_key)
    return {"job_id": str(payload.job_id), **result}
