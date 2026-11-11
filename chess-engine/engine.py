"""
Stockfish instance pool: get_engine / get_stockfish_instance /
release_stockfish_instance.

Scoring helpers moved to services/analysis.py and are re-exported here so
`from engine import analyze_move_cp` (tests, callers) keeps working.
"""

import logging
import queue as _queue
import threading

from stockfish import Stockfish

from config import POOL_SIZE, STOCKFISH_PATH
from services.analysis import analyze_move_cp, compute_game_accuracy, move_accuracy, win_percent

__all__ = [
    "POOL_SIZE",
    "STOCKFISH_PATH",
    "analyze_move_cp",
    "compute_game_accuracy",
    "get_engine",
    "get_stockfish_instance",
    "move_accuracy",
    "release_stockfish_instance",
    "win_percent",
]

logging.getLogger("stockfish").setLevel(logging.ERROR)

# C7 fix: Object pool — each thread gets its own Stockfish instance, preventing
# cross-thread FEN contamination from the previous singleton design.
_pool: _queue.Queue = _queue.Queue()
_pool_lock = threading.Lock()
_pool_initialized = False


def _init_pool() -> None:
    global _pool_initialized
    with _pool_lock:
        if _pool_initialized:
            return
        for _ in range(POOL_SIZE):
            try:
                sf = Stockfish(path=STOCKFISH_PATH or "stockfish")
                _pool.put(sf)
            except Exception as e:
                logging.error(f"Stockfish pool init failed: {e}")
        _pool_initialized = True


class _EngineCtx:
    """Context manager: acquires an engine from the pool, returns it on exit."""

    def __init__(self, depth: int):
        self.depth = depth
        self._sf: Stockfish | None = None

    def __enter__(self) -> Stockfish | None:
        _init_pool()
        try:
            self._sf = _pool.get(timeout=10)
            self._sf.set_depth(self.depth)
            return self._sf
        except _queue.Empty:
            logging.error("Stockfish pool exhausted — no instance available within 10s")
            return None
        except Exception as e:
            logging.error(f"Stockfish set_depth failed: {e}")
            if self._sf is not None:
                _pool.put(self._sf)
                self._sf = None
            return None

    def __exit__(self, *_: object) -> None:
        if self._sf is not None:
            _pool.put(self._sf)


def get_engine(depth: int = 15) -> "_EngineCtx":
    """Usage: `with get_engine(18) as sf:` — sf may be None if pool is exhausted."""
    return _EngineCtx(depth)


# Legacy shim so existing callers still work (used only in single-threaded paths)
def get_stockfish_instance(depth: int = 15) -> Stockfish | None:
    _init_pool()
    try:
        sf = _pool.get(timeout=5)
        sf.set_depth(depth)
        return sf
    except Exception as e:
        logging.error(f"get_stockfish_instance failed: {e}")
        return None


def release_stockfish_instance(sf: Stockfish | None) -> None:
    if sf is not None:
        _pool.put(sf)
