import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_url: str
    redis_url: str
    s3_endpoint: str
    s3_bucket: str
    s3_access_key: str
    s3_secret_key: str
    nestjs_internal_url: str
    calc_port: int
    log_level: str
    environment: str


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        # Respect already exported variables (e.g. CI or shell overrides).
        if key and key not in os.environ:
            os.environ[key] = value



def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def _env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value is None:
        return default
    return value



def get_settings() -> Settings:
    _load_local_env()

    return Settings(
        database_url=_required_env("DATABASE_URL"),
        redis_url=_required_env("REDIS_URL"),
        s3_endpoint=_env("S3_ENDPOINT"),
        s3_bucket=_env("S3_BUCKET"),
        s3_access_key=_env("S3_ACCESS_KEY"),
        s3_secret_key=_env("S3_SECRET_KEY"),
        nestjs_internal_url=_required_env("NESTJS_INTERNAL_URL"),
        calc_port=int(os.getenv("CALC_PORT", "8300")),
        log_level=os.getenv("LOG_LEVEL", "info"),
        environment=os.getenv("ENV", "development").lower(),
    )
