import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from routers import closing, imports, kpis, scenarios, snapshots

settings = get_settings()

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger("calc-engine")

app = FastAPI(
    title="Jupiter Plan Calc Engine",
    version="1.0.0",
    docs_url=None if settings.environment == "production" else "/docs",
    redoc_url=None if settings.environment == "production" else "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.nestjs_internal_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info("request_done method=%s path=%s duration_ms=%.2f", request.method, request.url.path, elapsed_ms)
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
    logger.exception("unexpected_error: %s", str(exc))
    return JSONResponse(status_code=500, content={"message": "Internal processing error"})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "1.0.0"}


app.include_router(kpis.router, prefix="/kpis", tags=["kpis"])
app.include_router(snapshots.router, prefix="/snapshots", tags=["snapshots"])
app.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
app.include_router(closing.router, prefix="/closing", tags=["closing"])
app.include_router(imports.router, prefix="/imports", tags=["imports"])
