"""
G18: GET /health used to take a Stockfish instance from the pool and never put
it back, so the pool was empty after STOCKFISH_POOL_SIZE probes (Render probes
/health continuously) and every analysis then answered 503.

These tests run against the REAL pool in engine.py (filled with fake engines),
not the patched acquire/release doubles the other tests use.
"""

import pytest

import engine
import main
from tests.conftest import ENGINE_TEST_KEY, FakeStockfish

# Captured at import, before the autouse fixture swaps them for doubles.
REAL_GET_ENGINE = engine.get_engine
REAL_ACQUIRE = engine.get_stockfish_instance
REAL_RELEASE = engine.release_stockfish_instance

POOL_SIZE = 2
START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


@pytest.fixture
def real_pool(monkeypatch):
    """The real pool functions, over a pool of POOL_SIZE fake engines."""
    while not engine._pool.empty():
        engine._pool.get_nowait()
    for _ in range(POOL_SIZE):
        engine._pool.put(FakeStockfish())
    monkeypatch.setattr(engine, "_pool_initialized", True)
    for mod in (engine, main):
        monkeypatch.setattr(mod, "get_engine", REAL_GET_ENGINE)
        monkeypatch.setattr(mod, "get_stockfish_instance", REAL_ACQUIRE)
        monkeypatch.setattr(mod, "release_stockfish_instance", REAL_RELEASE)
    yield engine._pool
    while not engine._pool.empty():
        engine._pool.get_nowait()


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
    while not real_pool.empty():
        real_pool.get_nowait()
    # Do not wait the pool's real 10 s timeout in a unit test.
    monkeypatch.setattr(engine._pool, "get", lambda timeout=None: (_ for _ in ()).throw(engine._queue.Empty()))
    assert client.get("/health").json() == {"status": "ok", "engine": "Engine unavailable"}
