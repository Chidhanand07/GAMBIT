"""
Gambit Engine HTTP API (FastAPI). Start with `uvicorn main:app`.

This module is the composition root: it builds the Supabase client, holds the
engine-pool functions as module globals, and includes the routers. Routers and
services read those globals through this module at call time (seams.py,
ADR 0301), so tests that monkeypatch `main.get_engine`, `main.supabase`,
`main.run_full_game_analysis`, ... keep working.
"""

import sys

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from supabase import Client, create_client

from auth import require_engine_key
from config import SUPABASE_KEY, SUPABASE_URL
from engine import EngineBusy, engine_status, get_engine, get_stockfish_instance, release_stockfish_instance
from routers import analysis, computer, health, moves
from seams import EngineSeams
from services import review

__all__ = [
    "SUPABASE_KEY",
    "SUPABASE_URL",
    "app",
    "engine_status",
    "get_engine",
    "get_stockfish_instance",
    "release_stockfish_instance",
    "run_full_game_analysis",
    "supabase",
]

supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

_seams: EngineSeams = sys.modules[__name__]  # type: ignore[assignment]


def run_full_game_analysis(game_id: str, pgn: str) -> str:
    """Background task for POST /analyse-game (see services/review.py); returns its ANALYSIS_* outcome."""
    return review.run_full_game_analysis(game_id, pgn, _seams)


# No /docs, /redoc or /openapi.json: the engine is a private backend (ENG-AUTH).
app = FastAPI(title="Gambit Engine", docs_url=None, redoc_url=None, openapi_url=None)

HTTP_SERVICE_UNAVAILABLE = 503


@app.exception_handler(EngineBusy)
def engine_busy(_request: Request, exc: EngineBusy) -> JSONResponse:
    """Every route that waits for Stockfish: saturated pool -> 503 + Retry-After (RATE-LIMITS)."""
    return JSONResponse(
        status_code=HTTP_SERVICE_UNAVAILABLE,
        content={"detail": "Engine busy"},
        headers={"Retry-After": str(exc.retry_after_seconds)},
    )


# /health is the only public route (platform health checks). Everything else
# requires the shared secret; a new router must be added to PROTECTED_ROUTERS.
app.include_router(health.build_router(_seams))

PROTECTED_ROUTERS = (moves.router, analysis.build_router(_seams), computer.router)
for _router in PROTECTED_ROUTERS:
    app.include_router(_router, dependencies=[Depends(require_engine_key)])
