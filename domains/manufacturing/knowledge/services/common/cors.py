from __future__ import annotations

from services.common.config import settings


def cors_allow_origins() -> list[str]:
    origins = [
        origin.strip()
        for origin in str(settings.CORS_ALLOW_ORIGINS or "").split(",")
        if origin.strip()
    ]
    return origins or [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
