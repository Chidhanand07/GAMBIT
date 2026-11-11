"""
Shared fixtures for the engine tests.

No test may touch a real Stockfish binary: an autouse fixture replaces every
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
sys.modules.setdefault('stockfish', _stockfish_stub)


class FakeStockfish:
    """
    Minimal stand-in for the `stockfish` package's Stockfish object.

    - best move: `best(board)` → chess.Move, default first legal move
    - evaluations: `evaluate(board)` → {'type': 'cp'|'mate', 'value': int}
      from the side-to-move's perspective, default 0
    """

    def __init__(self, best=None, evaluate=None, top_cp=0):
        self._best = best or (lambda b: next(iter(b.legal_moves), None))
        self._evaluate = evaluate or (lambda b: {'type': 'cp', 'value': 0})
        self._top_cp = top_cp
        self.board = chess.Board()
        self.depth = None

    def set_depth(self, d):
        self.depth = d

    def set_fen_position(self, fen):
        self.board = chess.Board(fen)

    def get_evaluation(self):
        return self._evaluate(self.board)

    def get_best_move(self):
        mv = self._best(self.board)
        return mv.uci() if mv else None

    def get_top_moves(self, n=1):
        mv = self._best(self.board)
        if mv is None:
            return []
        top_cp = self._top_cp(self.board) if callable(self._top_cp) else self._top_cp
        if isinstance(top_cp, dict):  # {'Mate': k}
            return [{'Move': mv.uci(), 'Centipawn': None, 'Mate': top_cp['Mate']}][:n]
        return [{'Move': mv.uci(), 'Centipawn': top_cp, 'Mate': None}][:n]


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


@pytest.fixture(autouse=True)
def engine_switch(monkeypatch):
    import engine
    import computer_engine
    import main

    sw = EngineSwitch()
    for mod in (engine, computer_engine, main):
        if hasattr(mod, 'get_engine'):
            monkeypatch.setattr(mod, 'get_engine', sw.ctx)
    for mod in (engine, main):
        monkeypatch.setattr(mod, 'get_stockfish_instance', sw.acquire)
        monkeypatch.setattr(mod, 'release_stockfish_instance', sw.release)
    return sw


@pytest.fixture
def stockfish(engine_switch):
    """Turn the engine on with a default FakeStockfish; tests may replace it."""
    engine_switch.instance = FakeStockfish()
    return engine_switch


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    import main
    return TestClient(main.app)
