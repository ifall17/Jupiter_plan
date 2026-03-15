import logging

logger = logging.getLogger("calc-engine.worker.calc")


class CalcWorker:
    async def handle_job(self, job_name: str, payload: dict) -> None:
        logger.info("calc_worker_job_started job=%s org_id=%s", job_name, payload.get("org_id"))
        logger.info("calc_worker_job_done job=%s org_id=%s", job_name, payload.get("org_id"))
