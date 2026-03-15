import json
import logging

from services.import_processor import ImportProcessor

logger = logging.getLogger("calc-engine.worker.import")


class ImportWorker:
    def __init__(self, imports_service, audit_service, calc_queue, events_gateway, s3_service) -> None:
        self.imports_service = imports_service
        self.audit_service = audit_service
        self.calc_queue = calc_queue
        self.events_gateway = events_gateway
        self.processor = ImportProcessor(s3_service=s3_service)

    async def process_excel(self, payload: dict) -> dict:
        job_id = payload["job_id"]
        s3_key = payload["s3_key"]
        org_id = payload["org_id"]
        user_id = payload["user_id"]
        period_id = payload["period_id"]

        try:
            logger.info("Import job %s started", job_id)
            await self.imports_service.update_status(job_id, "PROCESSING")

            result = await self.processor.process(s3_key)

            await self.imports_service.update_status(
                job_id,
                "DONE",
                {
                    "rows_inserted": result["inserted"],
                    "rows_skipped": result["skipped"],
                },
            )

            await self.audit_service.create_log(
                {
                    "action": "IMPORT_DONE",
                    "entity_type": "IMPORT_JOB",
                    "entity_id": job_id,
                    "org_id": org_id,
                    "user_id": user_id,
                }
            )

            self.events_gateway.emit("IMPORT_DONE", {"job_id": job_id, "inserted": result["inserted"], "skipped": result["skipped"]})
            await self.calc_queue.add("recalc-kpis", {"org_id": org_id, "period_id": period_id})

            logger.info("Import job %s done - inserted: %s", job_id, result["inserted"])
            return result

        except Exception as exc:
            await self.imports_service.update_status(job_id, "FAILED", {"error_report": {"message": str(exc)}})
            logger.exception("Import job %s failed", job_id)
            self.events_gateway.emit("IMPORT_FAILED", {"job_id": job_id})
            raise
