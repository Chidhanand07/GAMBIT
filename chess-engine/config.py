"""
Engine configuration: the only module that reads environment variables.

Values are read once, at import time, exactly like the legacy module-level
reads in main.py / engine.py / style_engine.py.
The legacy modules re-bind these names as their own globals, so code that
patches e.g. `engine.POOL_SIZE` or `style_engine.MODEL_PATH` keeps working.
"""

import os

# Supabase secret key (bypasses RLS; used to write post-game analysis back to `games`).
# Canonical name SUPABASE_SECRET_KEY (Supabase's new `sb_secret_...` key); the legacy
# SUPABASE_SERVICE_KEY is still read so an existing deployment keeps working.
SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")

# Shared secret callers must send in the X-Engine-Key header (see auth.py).
# Empty -> every endpoint except /health answers 503.
ENGINE_SHARED_SECRET: str = os.environ.get("ENGINE_SHARED_SECRET", "")

# Stockfish binary (None -> "stockfish" on PATH) and pool size.
STOCKFISH_PATH: str | None = os.environ.get("STOCKFISH_PATH")
POOL_SIZE: int = int(os.environ.get("STOCKFISH_POOL_SIZE", "4"))

# Bounded wait for a pool instance (RATE-LIMITS). At most POOL_SIZE requests use
# Stockfish and at most ENGINE_MAX_QUEUE more wait, each for at most
# ENGINE_QUEUE_TIMEOUT_SECONDS; anything beyond answers 503 "Engine busy" with
# Retry-After. Default queue: two waiting requests per instance (an analysis at the
# app's depths takes about a second, so a full queue drains within the timeout).
ENGINE_MAX_QUEUE: int = max(0, int(os.environ.get("ENGINE_MAX_QUEUE", str(POOL_SIZE * 2))))
ENGINE_QUEUE_TIMEOUT_SECONDS: float = float(os.environ.get("ENGINE_QUEUE_TIMEOUT_SECONDS", "5"))
if ENGINE_QUEUE_TIMEOUT_SECONDS <= 0:
    raise ValueError("ENGINE_QUEUE_TIMEOUT_SECONDS must be greater than 0")

# MAVERICK style policy weights.
MODEL_PATH: str = os.environ.get("STYLE_MODEL_PATH", "style_model.pt")
# Fallback when MODEL_PATH does not exist: download the weights from this https URL
# and accept them only if their SHA-256 equals MODEL_SHA256 (required with the URL).
# With MODEL_SHA256 set, a file already at MODEL_PATH must match it too.
MODEL_URL: str = os.environ.get("MAVERICK_MODEL_URL", "")
MODEL_SHA256: str = os.environ.get("MAVERICK_MODEL_SHA256", "")

# Search depth bounds for POST /analyze (ENG-DEPTH-BOUND, ADR F-063). Outside them the
# request is a 422 before an engine is taken. The app asks for 18 (analysis page, game
# server default, post-game review); every extra ply roughly doubles the time an
# instance is held (one /analyze, measured locally: depth 18 ~6 s, 20 ~13 s, 24 ~80 s), so a
# caller could otherwise pin the whole pool with a single request.
MIN_ANALYSIS_DEPTH: int = 1
MAX_ANALYSIS_DEPTH: int = 20
