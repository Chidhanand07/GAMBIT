"""
Gambit Engine HTTP API (FastAPI). Start with `uvicorn main:app`.

This module is the composition root: it builds the Supabase client, holds the
engine-pool functions as module globals, and includes the routers. Routers and
services read those globals through this module at call time (seams.py,
ADR 0301), so tests that monkeypatch `main.get_engine`, `main.supabase`,
`main.run_full_game_analysis`, ... keep working.
"""

import sys

from fastapi import FastAPI
from supabase import Client, create_client

from config import SUPABASE_KEY, SUPABASE_URL
from engine import get_engine, get_stockfish_instance, release_stockfish_instance
from routers import analysis, computer, health, moves
from seams import EngineSeams
from services import review

__all__ = [
    "SUPABASE_KEY",
    "SUPABASE_URL",
    "app",
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


def run_full_game_analysis(game_id: str, pgn: str) -> None:
    """Background task for POST /analyse-game (see services/review.py)."""
    review.run_full_game_analysis(game_id, pgn, _seams)


app = FastAPI(title="Gambit Engine")
app.include_router(health.build_router(_seams))
app.include_router(moves.router)
app.include_router(analysis.build_router(_seams))
app.include_router(computer.router)
