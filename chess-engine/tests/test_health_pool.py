"""
G18: GET /health used to take a Stockfish instance from the pool and never put
it back, so the pool was empty after STOCKFISH_POOL_SIZE probes (Render probes
/health continuously) and every analysis then answered 503.

RATE-LIMITS: /health no longer takes an instance at all, so a busy pool can
never block or slow it; it reports whether the pool has any engine.

These tests run against the REAL pool in engine.py (filled with fake engines),
not the patched acquire/release doubles the other tests use (`real_pool` in
conftest.py).
"""

import time

import engine
from tests.conftest import ENGINE_TEST_KEY, REAL_POOL_SIZE

POOL_SIZE = REAL_POOL_SIZE
START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
# /health must answer far faster than the pool's queue timeout.
HEALTH_MAX_SECONDS = 0.5


def test_health_returns_its_engine_to_the_pool(client, real_pool):
    assert client.get("/health").json() == {"status": "ok", "engine": "online"}
    assert real_pool.qsize() == POOL_SIZE


def test_more_health_probes_than_the_pool_size_then_an_analysis_still_works(client, real_pool):
    for _ in range(POOL_SIZE * 5):
        assert client.get("/health").json()["engine"] == "online"
    assert real_pool.qsize() == POOL_SIZE

    res = client.post("/analyze", json={"fen": START, "depth": 5}, headers={"X-Engine-Key": ENGINE_TEST_KEY})
    assert res.status_code == 200
    assert res.json()["best_move"]
    assert real_pool.qsize() == POOL_SIZE


def test_health_reports_unavailable_without_hanging_when_the_pool_is_empty(client, real_pool, monkeypatch):
    # RATE-LIMITS: an empty pool because every instance is in use is "busy", not "down":
    # /health answers at once and still reports the engine as online. (Before: it waited
    # on the pool and reported "Engine unavailable".)
    while not real_pool.empty():
        real_pool.get_nowait()
    monkeypatch.setattr(engine._pool, "get", lambda timeout=None: (_ for _ in ()).throw(engine._queue.Empty()))
    started = time.monotonic()
    assert client.get("/health").json() == {"status": "ok", "engine": "online"}
    assert time.monotonic() - started < HEALTH_MAX_SECONDS


def test_health_reports_unavailable_when_no_stockfish_could_start(client, real_pool, monkeypatch):
    monkeypatch.setattr(engine, "_pool_capacity", 0)
    assert client.get("/health").json() == {"status": "ok", "engine": "Engine unavailable"}
