"""
Stockfish instance pool: get_engine / get_stockfish_instance /
release_stockfish_instance.

Scoring helpers moved to services/analysis.py and are re-exported here so
`from engine import analyze_move_cp` (tests, callers) keeps working.
"""

import logging
import math
import queue as _queue
import threading

from stockfish import Stockfish

from config import ENGINE_MAX_QUEUE, ENGINE_QUEUE_TIMEOUT_SECONDS, POOL_SIZE, STOCKFISH_PATH
from services.analysis import analyze_move_cp, compute_game_accuracy, move_accuracy, win_percent

__all__ = [
    "ENGINE_MAX_QUEUE",
    "ENGINE_QUEUE_TIMEOUT_SECONDS",
    "POOL_SIZE",
    "STOCKFISH_PATH",
    "AdmissionGate",
    "EngineBusy",
    "analyze_move_cp",
    "compute_game_accuracy",
    "engine_status",
    "get_engine",
    "get_stockfish_instance",
    "move_accuracy",
    "release_stockfish_instance",
    "win_percent",
]

logging.getLogger("stockfish").setLevel(logging.ERROR)

ENGINE_ONLINE = "online"
ENGINE_UNAVAILABLE = "Engine unavailable"
# A full-game review was admitted when /analyse-game answered "queued"; it waits
# this long for an instance instead of being dropped half-way (RATE-LIMITS ADR).
BACKGROUND_ACQUIRE_TIMEOUT_SECONDS = 600
MIN_RETRY_AFTER_SECONDS = 1

# C7 fix: Object pool — each thread gets its own Stockfish instance, preventing
# cross-thread FEN contamination from the previous singleton design.
_pool: _queue.Queue = _queue.Queue()
_pool_lock = threading.Lock()
_pool_initialized = False
# How many Stockfish instances actually started (0: no engine at all).
_pool_capacity = 0


class EngineBusy(Exception):
    """Every instance is in use and the wait queue is full, or the wait timed out (HTTP 503)."""

    def __init__(self, retry_after_seconds: int):
        super().__init__("Engine busy")
        self.retry_after_seconds = retry_after_seconds


class AdmissionGate:
    """
    Counts requests that use or wait for an engine; refuses (never blocks) past `slots`.

    slots = STOCKFISH_POOL_SIZE (in use) + ENGINE_MAX_QUEUE (waiting).
    """

    def __init__(self, slots: int):
        self._slots = threading.BoundedSemaphore(slots) if slots > 0 else None

    def try_enter(self) -> bool:
        return self._slots is not None and self._slots.acquire(blocking=False)

    def leave(self) -> None:
        if self._slots is not None:
            self._slots.release()


_gate = AdmissionGate(POOL_SIZE + ENGINE_MAX_QUEUE)


def _init_pool() -> None:
    global _pool_initialized, _pool_capacity
    with _pool_lock:
        if _pool_initialized:
            return
        for _ in range(POOL_SIZE):
            try:
                sf = Stockfish(path=STOCKFISH_PATH or "stockfish")
                _pool.put(sf)
                _pool_capacity += 1
            except Exception as e:
                logging.error(f"Stockfish pool init failed: {e}")
        _pool_initialized = True


def _retry_after_seconds() -> int:
    return max(MIN_RETRY_AFTER_SECONDS, math.ceil(ENGINE_QUEUE_TIMEOUT_SECONDS))


def _busy(reason: str) -> EngineBusy:
    logging.warning(f"Stockfish pool busy: {reason}")
    return EngineBusy(_retry_after_seconds())


class _EngineCtx:
    """
    Context manager: acquires an engine from the pool, returns it on exit.

    Bounded (RATE-LIMITS): raises EngineBusy when the wait queue is full (at
    once) or no instance frees up within ENGINE_QUEUE_TIMEOUT_SECONDS. Yields
    None when no Stockfish could be started at all ("Engine unavailable").
    """

    def __init__(self, depth: int):
        self.depth = depth
        self._sf: Stockfish | None = None
        self._gate: AdmissionGate | None = None
        self._admitted = False

    def __enter__(self) -> Stockfish | None:
        _init_pool()
        if _pool_capacity == 0:
            return None
        gate = _gate
        if not gate.try_enter():
            raise _busy("wait queue full")
        try:
            self._sf = _pool.get(timeout=ENGINE_QUEUE_TIMEOUT_SECONDS)
        except _queue.Empty:
            gate.leave()
            raise _busy(f"no instance within {ENGINE_QUEUE_TIMEOUT_SECONDS}s") from None
        self._gate, self._admitted = gate, True
        try:
            self._sf.set_depth(self.depth)
            return self._sf
        except Exception as e:
            logging.error(f"Stockfish set_depth failed: {e}")
            self.__exit__()
            return None

    def __exit__(self, *_: object) -> None:
        if self._sf is not None:
            _pool.put(self._sf)
            self._sf = None
        if self._admitted and self._gate is not None:
            self._gate.leave()
            self._admitted = False


def get_engine(depth: int = 15) -> "_EngineCtx":
    """Usage: `with get_engine(18) as sf:` — sf is None without Stockfish; raises EngineBusy when saturated."""
    return _EngineCtx(depth)


def engine_status() -> str:
    """For GET /health: never takes an instance, so a busy pool cannot block it."""
    _init_pool()
    return ENGINE_ONLINE if _pool_capacity > 0 else ENGINE_UNAVAILABLE


# Background full-game reviews only (services/review.py). Not behind the request
# gate: the review was admitted when /analyse-game answered, so it waits for an
# instance rather than being rejected half-way (RATE-LIMITS ADR).
def get_stockfish_instance(depth: int = 15) -> Stockfish | None:
    _init_pool()
    if _pool_capacity == 0:
        return None
    try:
        sf = _pool.get(timeout=BACKGROUND_ACQUIRE_TIMEOUT_SECONDS)
    except _queue.Empty:
        logging.error("get_stockfish_instance: no instance within the background wait")
        return None
    try:
        sf.set_depth(depth)
        return sf
    except Exception as e:
        logging.error(f"get_stockfish_instance failed: {e}")
        _pool.put(sf)
        return None


def release_stockfish_instance(sf: Stockfish | None) -> None:
    if sf is not None:
        _pool.put(sf)
