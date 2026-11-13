"""
Shared fixtures for the engine tests.

No test may touch a real Stockfish binary (except
tests/test_perspective_real_stockfish.py, which runs only where one is
installed and imports the real package itself): an autouse fixture replaces every
place the code acquires an engine with a controllable fake. By default the fake
reports "engine unavailable" (None); tests that need an engine use the
`stockfish` fixture to switch in a FakeStockfish.

The real style model (style_model.pt) is used, so MAVERICK tests exercise the
real policy network on CPU.
"""

import contextlib
import sys
from unittest.mock import MagicMock

import chess
import pytest

# Keep the old behaviour for environments without the python package.
_stockfish_stub = MagicMock()
_stockfish_stub.Stockfish = MagicMock
sys.modules.setdefault("stockfish", _stockfish_stub)


def package_sign(board):
    """
    The `stockfish` package turns the engine's side-to-move scores into WHITE's
    view: `compare = 1 if "w" in fen_position else -1` (stockfish/models.py,
    get_evaluation lines 499/512; get_top_moves line 546).
    """
    return 1 if board.turn == chess.WHITE else -1


class FakeStockfish:
    """
    Minimal stand-in for the `stockfish` package's Stockfish object.

    The callbacks answer what the Stockfish BINARY prints (UCI: from the side
    to move's point of view); the fake then converts them exactly like the
    package does, so `get_evaluation()` / `get_top_moves()` report from
    WHITE's point of view, as the real package does.

    - best move: `best(board)` -> chess.Move, default first legal move
    - evaluation: `evaluate(board)` -> {'type': 'cp'|'mate', 'value': int}
      for the side to move, default 0 (mate 0 == the side to move is mated)
    - top line: `top_cp` (int, {'Mate': k}, or a callable of the board) for the side to move
    """

    def __init__(self, best=None, evaluate=None, top_cp=0):
        self._best = best or (lambda b: next(iter(b.legal_moves), None))
        self._evaluate = evaluate or (lambda b: {"type": "cp", "value": 0})
        self._top_cp = top_cp
        self.board = chess.Board()
        self.depth = None

    def set_depth(self, d):
        self.depth = d

    def set_fen_position(self, fen):
        self.board = chess.Board(fen)

    def get_evaluation(self):
        uci = self._evaluate(self.board)
        return {"type": uci["type"], "value": uci["value"] * package_sign(self.board)}

    def get_best_move(self):
        mv = self._best(self.board)
        return mv.uci() if mv else None

    def get_top_moves(self, n=1):
        mv = self._best(self.board)
        if mv is None:
            return []
        sign = package_sign(self.board)
        top_cp = self._top_cp(self.board) if callable(self._top_cp) else self._top_cp
        if isinstance(top_cp, dict):  # {'Mate': k}
            return [{"Move": mv.uci(), "Centipawn": None, "Mate": top_cp["Mate"] * sign}][:n]
        return [{"Move": mv.uci(), "Centipawn": top_cp * sign, "Mate": None}][:n]


PIECE_CP = {chess.PAWN: 100, chess.KNIGHT: 300, chess.BISHOP: 300, chess.ROOK: 500, chess.QUEEN: 900}


def material_for_side_to_move(board):
    """Static material balance in centipawns for the side to move."""
    pieces = board.piece_map().values()
    return sum(PIECE_CP.get(p.piece_type, 0) * (1 if p.color == board.turn else -1) for p in pieces)


SEARCH_MATE = 1_000_000  # internal mate score of the fake search


def negamax(board, depth):
    """Material negamax for the side to move: (score, best move); SEARCH_MATE-ish when mating."""
    if board.is_checkmate():
        return -SEARCH_MATE, None
    if depth == 0 or not any(board.legal_moves):
        return material_for_side_to_move(board), None
    best, best_score = None, None
    for mv in board.legal_moves:
        board.push(mv)
        score = -negamax(board, depth - 1)[0]
        board.pop()
        if best_score is None or score > best_score:
            best, best_score = mv, score
    return best_score, best


def _uci_report(score):
    """A search score as the binary prints it: {'type': 'mate', 'value': +-1} or centipawns."""
    if abs(score) >= SEARCH_MATE // 2:
        return {"type": "mate", "value": 1 if score > 0 else -1}
    return {"type": "cp", "value": score}


def material_engine(depth=0):
    """
    A tiny but consistent engine over material. `get_evaluation()` searches
    `depth` plies and the top line `depth + 1`, so the top line's score equals
    the best evaluation one move later (what a real engine approximates).
    Reports like the Stockfish binary (side to move; "mate 0" once the side to
    move is mated), wrapped in FakeStockfish's package conversion.
    """

    def evaluate(board):
        if board.is_checkmate():
            return {"type": "mate", "value": 0}
        return _uci_report(negamax(board, depth)[0])

    def top(board):
        report = _uci_report(negamax(board, depth + 1)[0])
        return {"Mate": report["value"]} if report["type"] == "mate" else report["value"]

    return FakeStockfish(best=lambda b: negamax(b, depth + 1)[1], evaluate=evaluate, top_cp=top)


class EngineSwitch:
    """What the patched get_engine / get_stockfish_instance hand out."""

    def __init__(self):
        self.instance = None  # None == engine unavailable
        self.released = 0

    def ctx(self, depth=15):
        inst = self.instance
        if inst is not None:
            inst.set_depth(depth)

        @contextlib.contextmanager
        def _cm():
            yield inst

        return _cm()

    def acquire(self, depth=15):
        if self.instance is not None:
            self.instance.set_depth(depth)
        return self.instance

    def release(self, sf):
        if sf is not None:
            self.released += 1

    def status(self):
        return "Engine unavailable" if self.instance is None else "online"


@pytest.fixture(autouse=True)
def engine_switch(monkeypatch):
    import engine
    import computer_engine
    import main

    sw = EngineSwitch()
    for mod in (engine, computer_engine, main):
        if hasattr(mod, "get_engine"):
            monkeypatch.setattr(mod, "get_engine", sw.ctx)
    for mod in (engine, main):
        monkeypatch.setattr(mod, "get_stockfish_instance", sw.acquire)
        monkeypatch.setattr(mod, "release_stockfish_instance", sw.release)
        monkeypatch.setattr(mod, "engine_status", sw.status)
    return sw


@pytest.fixture
def stockfish(engine_switch):
    """Turn the engine on with a default FakeStockfish; tests may replace it."""
    engine_switch.instance = FakeStockfish()
    return engine_switch


# The shared secret the tests configure the engine with (see `engine_key`).
ENGINE_TEST_KEY = "test-engine-key"


@pytest.fixture(autouse=True)
def engine_key(monkeypatch):
    """Configure ENGINE_SHARED_SECRET for every test (tests may override or unset it)."""
    import config

    monkeypatch.setattr(config, "ENGINE_SHARED_SECRET", ENGINE_TEST_KEY)
    return ENGINE_TEST_KEY


@pytest.fixture
def client(engine_key):
    """A caller that holds the shared secret (what the game server and Next.js send)."""
    from fastapi.testclient import TestClient
    import main

    return TestClient(main.app, headers={"X-Engine-Key": engine_key})


# ── the real pool (engine.py) over fake engines ──────────────────────────────

REAL_POOL_SIZE = 2
REAL_POOL_FUNCTION_NAMES = ("get_engine", "get_stockfish_instance", "release_stockfish_instance", "engine_status")
_real_pool_functions: dict = {}


def pytest_configure(config):
    """Capture the real pool functions before any autouse fixture swaps them for doubles."""
    import engine

    _real_pool_functions.update({name: getattr(engine, name) for name in REAL_POOL_FUNCTION_NAMES})


@pytest.fixture
def real_pool(monkeypatch):
    """
    The real pool functions (engine.py), over a pool of REAL_POOL_SIZE fake
    engines, instead of the EngineSwitch doubles the other tests use.
    """
    import computer_engine
    import engine
    import main

    while not engine._pool.empty():
        engine._pool.get_nowait()
    for _ in range(REAL_POOL_SIZE):
        engine._pool.put(FakeStockfish())
    monkeypatch.setattr(engine, "_pool_initialized", True)
    monkeypatch.setattr(engine, "_pool_capacity", REAL_POOL_SIZE)
    monkeypatch.setattr(engine, "_gate", engine.AdmissionGate(REAL_POOL_SIZE + engine.ENGINE_MAX_QUEUE))
    for mod in (engine, computer_engine, main):
        for name, fn in _real_pool_functions.items():
            if hasattr(mod, name):
                monkeypatch.setattr(mod, name, fn)
    yield engine._pool
    while not engine._pool.empty():
        engine._pool.get_nowait()
