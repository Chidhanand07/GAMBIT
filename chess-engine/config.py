"""
Engine configuration: the only module that reads environment variables.

Values are read once, at import time, exactly like the legacy module-level
reads in main.py / engine.py / style_engine.py (same names, same defaults).
The legacy modules re-bind these names as their own globals, so code that
patches e.g. `engine.POOL_SIZE` or `style_engine.MODEL_PATH` keeps working.
"""

import os

# Supabase (service role, used to write post-game analysis back to `games`).
SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_SERVICE_KEY", "")

# Stockfish binary (None -> "stockfish" on PATH) and pool size.
STOCKFISH_PATH: str | None = os.environ.get("STOCKFISH_PATH")
POOL_SIZE: int = int(os.environ.get("STOCKFISH_POOL_SIZE", "4"))

# MAVERICK style policy weights.
MODEL_PATH: str = os.environ.get("STYLE_MODEL_PATH", "style_model.pt")
