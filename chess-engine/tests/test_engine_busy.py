"""
RATE-LIMITS: a bounded wait for a Stockfish instance.

At most STOCKFISH_POOL_SIZE requests use the engine and at most
ENGINE_MAX_QUEUE more wait for it, each for at most
ENGINE_QUEUE_TIMEOUT_SECONDS. Anything beyond that answers
503 {"detail": "Engine busy"} with a Retry-After header, instead of piling up
threads that each hold a request open.

Runs against the real pool (conftest.py `real_pool`) filled with fake engines.
"""

import contextlib
import threading
import time

import pytest

import engine
from tests.conftest import REAL_POOL_SIZE

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
SHORT_TIMEOUT = 0.2
LONG_TIMEOUT = 5.0
RELEASE_AFTER = 0.1
# "Immediately": well under the queue timeout.
IMMEDIATE_SECONDS = 1.0


@pytest.fixture
def saturate(monkeypatch, real_pool):
    """
    Set the queue length and wait (the gate is rebuilt for the new length), then take
    every instance out of the pool, as REAL_POOL_SIZE long analyses would. Returns the
    ExitStack holding them: `.close()` releases them all.
    """
    stack = contextlib.ExitStack()

    def _saturate(max_queue: int, timeout: float) -> contextlib.ExitStack:
        monkeypatch.setattr(engine, "ENGINE_MAX_QUEUE", max_queue)
        monkeypatch.setattr(engine, "ENGINE_QUEUE_TIMEOUT_SECONDS", timeout)
        monkeypatch.setattr(engine, "_gate", engine.AdmissionGate(REAL_POOL_SIZE + max_queue))
        held = [stack.enter_context(engine.get_engine(1)) for _ in range(REAL_POOL_SIZE)]
        assert all(sf is not None for sf in held)
        return stack

    yield _saturate
    stack.close()


def analyze(client):
    return client.post("/analyze", json={"fen": START, "depth": 5})


def assert_busy(res):
    assert res.status_code == 503
    assert res.json() == {"detail": "Engine busy"}
    assert int(res.headers["Retry-After"]) >= 1


def test_a_saturated_pool_answers_503_engine_busy_after_the_wait(client, saturate):
    saturate(max_queue=1, timeout=SHORT_TIMEOUT)
    started = time.monotonic()
    assert_busy(analyze(client))
    assert time.monotonic() - started >= SHORT_TIMEOUT


def test_a_waiting_request_succeeds_once_an_instance_is_released(client, saturate):
    held = saturate(max_queue=1, timeout=LONG_TIMEOUT)
    threading.Timer(RELEASE_AFTER, held.close).start()
    res = analyze(client)
    assert res.status_code == 200
    assert res.json()["best_move"]


def test_a_full_queue_rejects_immediately(client, saturate):
    saturate(max_queue=0, timeout=LONG_TIMEOUT)
    started = time.monotonic()
    assert_busy(analyze(client))
    assert time.monotonic() - started < IMMEDIATE_SECONDS


def test_every_engine_endpoint_shares_the_guard(client, saturate):
    saturate(max_queue=0, timeout=LONG_TIMEOUT)
    assert_busy(client.post("/classify-move", json={"fen": START, "move": "e2e4"}))
    assert_busy(client.post("/computer-move", json={"fen": START, "difficulty": "hard"}))


def test_health_still_answers_while_the_pool_is_busy(client, saturate):
    saturate(max_queue=0, timeout=LONG_TIMEOUT)
    started = time.monotonic()
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "engine": "online"}
    assert time.monotonic() - started < IMMEDIATE_SECONDS


def test_slots_and_instances_come_back_after_a_rejection(client, saturate, real_pool):
    held = saturate(max_queue=0, timeout=SHORT_TIMEOUT)
    assert_busy(analyze(client))
    held.close()
    assert real_pool.qsize() == REAL_POOL_SIZE
    for _ in range(REAL_POOL_SIZE * 3):
        assert analyze(client).status_code == 200
    assert real_pool.qsize() == REAL_POOL_SIZE


def test_analyse_game_is_refused_before_anything_is_queued_when_busy(client, saturate, monkeypatch):
    import main

    queued = []
    monkeypatch.setattr(main, "run_full_game_analysis", lambda gid, pgn: queued.append(gid))
    saturate(max_queue=0, timeout=LONG_TIMEOUT)
    pgn = "1. e4 e5 2. Nf3 Nc6 *"
    res = client.post(
        "/analyse-game",
        json={"game_id": "11111111-1111-4111-8111-111111111111", "pgn": pgn, "time_control": "10"},
    )
    assert_busy(res)
    assert queued == []


def test_a_background_review_waits_past_the_queue_limits_instead_of_failing(saturate):
    # Admitted reviews are never rejected half-way: they bypass the request gate and wait.
    held = saturate(max_queue=0, timeout=SHORT_TIMEOUT)
    threading.Timer(SHORT_TIMEOUT * 2, held.close).start()
    sf = engine.get_stockfish_instance(depth=1)
    try:
        assert sf is not None
    finally:
        engine.release_stockfish_instance(sf)


def test_the_gate_admits_pool_size_plus_queue():
    gate = engine.AdmissionGate(3)
    assert [gate.try_enter() for _ in range(4)] == [True, True, True, False]
    gate.leave()
    assert gate.try_enter() is True


def test_queue_settings_have_sane_defaults():
    import config

    assert config.ENGINE_MAX_QUEUE >= 0
    assert 0 < config.ENGINE_QUEUE_TIMEOUT_SECONDS <= 30
