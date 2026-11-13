"""
ENG-PERSPECTIVE against the REAL Stockfish binary and the real `stockfish` package.

Skipped unless a binary is found (STOCKFISH_PATH, `stockfish` on PATH, or
/opt/homebrew/bin/stockfish). conftest.py stubs the `stockfish` module for
every other test, so the real package is imported here explicitly.
"""

import importlib
import os
import shutil
import sys

import chess
import pytest

import computer_engine
from services.analysis import analyze_move_cp
from services.perspective import MATE_CP, evaluation_for

HOMEBREW_STOCKFISH = "/opt/homebrew/bin/stockfish"
REAL_DEPTH = 12
SOUND_MOVE_MAX_LOSS = 50  # at this depth a main-line opening move loses far less
UNSOUND_CLASSES = ("Inaccuracy", "Mistake", "Blunder", "Miss")

START = chess.STARTING_FEN
AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
WHITE_QUEEN_UP_BLACK_TO_MOVE = "4k3/8/8/8/8/8/8/3QK3 b - - 0 1"
BLACK_QUEEN_UP_WHITE_TO_MOVE = "3qk3/8/8/8/8/8/8/4K3 w - - 0 1"
FOOLS_MATE = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"  # White is mated


def _binary():
    for candidate in (os.environ.get("STOCKFISH_PATH"), shutil.which("stockfish"), HOMEBREW_STOCKFISH):
        if candidate and os.path.exists(candidate):
            return candidate
    return None


BINARY = _binary()
pytestmark = pytest.mark.skipif(BINARY is None, reason="no Stockfish binary installed")


@pytest.fixture
def real_sf(monkeypatch):
    stub = sys.modules.pop("stockfish", None)
    try:
        package = importlib.import_module("stockfish")
    finally:
        if stub is not None:
            sys.modules["stockfish"] = stub
    sf = package.Stockfish(path=BINARY)
    sf.set_depth(REAL_DEPTH)
    yield sf
    del sf


def test_the_package_reports_whites_view_whoever_is_to_move(real_sf):
    real_sf.set_fen_position(WHITE_QUEEN_UP_BLACK_TO_MOVE)
    white_winning = real_sf.get_evaluation()
    real_sf.set_fen_position(BLACK_QUEEN_UP_WHITE_TO_MOVE)
    black_winning = real_sf.get_evaluation()
    assert white_winning["type"] == "cp" and white_winning["value"] > 0
    assert black_winning["type"] == "cp" and black_winning["value"] < 0
    board = chess.Board(WHITE_QUEEN_UP_BLACK_TO_MOVE)
    assert evaluation_for(white_winning, board, chess.WHITE) > 0
    assert evaluation_for(white_winning, board, chess.BLACK) < 0


def test_a_checkmated_side_to_move_is_mate_0_and_a_win_for_the_other_side(real_sf):
    real_sf.set_fen_position(FOOLS_MATE)
    evaluation = real_sf.get_evaluation()
    assert evaluation == {"type": "mate", "value": 0}
    board = chess.Board(FOOLS_MATE)
    assert evaluation_for(evaluation, board, chess.BLACK) == MATE_CP
    assert evaluation_for(evaluation, board, chess.WHITE) == -MATE_CP


@pytest.mark.parametrize("fen,move,color", [(START, "e2e4", chess.WHITE), (AFTER_E4, "e7e5", chess.BLACK)])
def test_a_main_line_opening_move_is_not_an_inaccuracy(real_sf, fen, move, color):
    cp_loss, cls, *_rest, acc = analyze_move_cp(real_sf, fen, move, color)
    assert cls not in UNSOUND_CLASSES  # 1.e4 used to be an "Inaccuracy"
    assert cp_loss < SOUND_MOVE_MAX_LOSS
    assert acc > 90


@pytest.mark.parametrize("fen,move,color", [(START, "f2f3", chess.WHITE), (AFTER_E4, "g7g5", chess.BLACK)])
def test_a_dubious_move_costs_more_than_a_main_line_move(real_sf, fen, move, color):
    good = {chess.WHITE: "e2e4", chess.BLACK: "e7e5"}[color]
    assert analyze_move_cp(real_sf, fen, move, color)[0] > analyze_move_cp(real_sf, fen, good, color)[0]


@pytest.mark.parametrize(
    "fen,free_capture",
    [
        # White wins a knight (Stockfish: about +2.2 after dxe5, -4.7 after h3).
        ("6k1/pp3ppp/8/4n3/3P4/8/PP3PPP/6K1 w - - 0 1", "d4e5"),
        # The mirror image: Black wins a knight.
        ("6k1/pp3ppp/8/3p4/4N3/8/PP3PPP/6K1 b - - 0 1", "d5e4"),
    ],
)
def test_maverick_takes_the_free_piece_for_its_own_side(real_sf, stockfish, monkeypatch, fen, free_capture):
    stockfish.instance = real_sf
    quiet = chess.Move.from_uci("h2h3" if chess.Board(fen).turn == chess.WHITE else "h7h6")
    capture = chess.Move.from_uci(free_capture)
    monkeypatch.setattr(computer_engine, "_model_move_ranking", lambda _fen: [(quiet, 0.9), (capture, 0.1)])
    assert computer_engine.get_computer_move(fen, "hard")["uci"] == free_capture
