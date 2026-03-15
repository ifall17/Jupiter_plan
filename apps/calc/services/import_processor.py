import io
import logging
import re
import time
from decimal import Decimal

import pandas as pd

from redis_client import publish_event
from utils.decimal_utils import to_decimal
from utils.syscohada import is_valid_syscohada

logger = logging.getLogger("calc-engine.import")


class ImportProcessor:
    def __init__(self, s3_service) -> None:
        self.s3_service = s3_service

    async def process(self, s3_key: str) -> dict[str, object]:
        started = time.perf_counter()
        logger.info("import_progress s3_key=%s progress=0", s3_key)
        try:
            content = await self.s3_service.get_object(s3_key)
            if content is None:
                raise RuntimeError("Import file not found")

            frame = pd.read_excel(io.BytesIO(content))
            logger.info("import_progress s3_key=%s progress=25", s3_key)

            errors: list[dict[str, object]] = []
            valid_rows: list[dict[str, object]] = []

            for row_index, row in frame.iterrows():
                account_code = str(row.get("account_code", "")).strip()
                # Excel readers can coerce numeric codes to float-like strings (e.g. "701000.0").
                if account_code.endswith('.0') and account_code[:-2].isdigit():
                    account_code = account_code[:-2]
                department = str(row.get("department", "")).strip()
                amount = to_decimal(row.get("amount", "0"))

                if not re.match(r"^\d{6,8}$", account_code) or not is_valid_syscohada(account_code):
                    errors.append({"row": int(row_index) + 2, "column": "account_code", "error": "INVALID_SYSCOHADA"})
                    continue
                if department == "":
                    errors.append({"row": int(row_index) + 2, "column": "department", "error": "REQUIRED"})
                    continue
                if amount <= Decimal("0"):
                    errors.append({"row": int(row_index) + 2, "column": "amount", "error": "MUST_BE_POSITIVE"})
                    continue

                valid_rows.append(
                    {
                        "period_id": str(row.get("period_id", "")),
                        "account_code": account_code,
                        "account_label": str(row.get("account_label", "")).strip()[:200],
                        "department": department,
                        "amount": amount,
                    }
                )

            logger.info("import_progress s3_key=%s progress=50", s3_key)

            total_rows = max(len(frame.index), 1)
            if len(errors) / total_rows > 0.5:
                await publish_event("imports", '{"status":"FAILED"}')
                return {"inserted": 0, "skipped": len(frame.index), "errors": errors, "rejected": True}

            logger.info("import_progress s3_key=%s progress=75", s3_key)
            await publish_event("imports", '{"status":"DONE"}')

            elapsed = time.perf_counter() - started
            logger.info("import_progress s3_key=%s progress=100", s3_key)
            logger.info("import_done s3_key=%s inserted=%d skipped=%d duration_ms=%.2f", s3_key, len(valid_rows), len(errors), elapsed * 1000)

            return {"inserted": len(valid_rows), "skipped": len(errors), "errors": errors, "rejected": False}
        finally:
            await self.s3_service.delete_object(s3_key)
