"""
engine.py — win%, per-move accuracy, and move classification edge cases
(mates, misses, perspective, bad input).
"""

import chess
import pytest

from engine import win_percent, move_accuracy, analyze_move_cp
from tests.conftest import FakeStockfish

START = chess.STARTING_FEN


# ── win_percent / move_accuracy ──────────────────────────────────────────────


def test_win_percent_is_50_at_equality_and_symmetric():
    assert win_percent(0) == pytest.approx(50.0)
    for cp in (50, 200, 800):
        assert win_percent(cp) + win_percent(-cp) == pytest.approx(100.0)


def test_win_percent_is_monotonic_and_bounded():
    values = [win_percent(cp) for cp in range(-3000, 3001, 100)]
    assert values == sorted(values)
    assert all(0.0 <= v <= 100.0 for v in values)


def test_move_accuracy_is_100ish_for_no_drop_and_falls_with_bigger_drops():
    assert move_accuracy(60, 60) == pytest.approx(100.0, abs=0.01)
    assert move_accuracy(60, 70) == pytest.approx(100.0, abs=0.01)  # improving never penalised
    drops = [move_accuracy(80, 80 - d) for d in (0, 5, 10, 20, 40, 80)]
    assert drops == sorted(drops, reverse=True)
    assert all(0.0 <= d <= 100.0 for d in drops)


# ── analyze_move_cp ──────────────────────────────────────────────────────────


def sf_with(best_uci, best_cp, after):
    """Fake engine: best move/score before; `after` is the eval dict after the played move."""
    calls = {"n": 0}

    def evaluate(_board):
        calls["n"] += 1
        return {"type": "cp", "value": best_cp} if calls["n"] == 1 else after

    return FakeStockfish(best=lambda b: chess.Move.from_uci(best_uci), evaluate=evaluate, top_cp=best_cp)


def test_returns_eight_fields():
    result = analyze_move_cp(sf_with("e2e4", 30, {"type": "cp", "value": -30}), START, "e2e4", chess.WHITE)
    assert len(result) == 8
    cp_loss, cls, eb, ea, ebest, best_uci, played_uci, acc = result
    assert (cp_loss, cls, best_uci, played_uci) == (0, "Great move", "e2e4", "e2e4")
    assert 0.0 <= acc <= 100.0


def test_accepts_san_as_well_as_uci():
    result = analyze_move_cp(sf_with("e2e4", 30, {"type": "cp", "value": -30}), START, "e4", chess.WHITE)
    assert result[6] == "e2e4"


def test_illegal_or_garbage_move_is_refused_not_called_a_mistake():
    # Was: classified "Mistake" with played_uci None. /classify-move now answers 400 first.
    with pytest.raises(ValueError):
        analyze_move_cp(sf_with("e2e4", 30, {"type": "cp", "value": 0}), START, "zz9", chess.WHITE)


def test_delivering_checkmate_is_never_a_blunder():
    # White to move, Qh5xf7# (scholar's mate). After it, black is mated: eval {'mate', 0}.
    fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"
    sf = sf_with("h5f7", 10000, {"type": "mate", "value": 0})
    cls = analyze_move_cp(sf, fen, "h5f7", chess.WHITE)[1]
    assert cls not in ("Blunder", "Miss", "Mistake")


def test_walking_into_mate_is_a_blunder():
    sf = sf_with("e2e4", 20, {"type": "mate", "value": 2})  # opponent mates in 2 after our move
    assert analyze_move_cp(sf, START, "f2f3", chess.WHITE)[1] == "Blunder"


def test_throwing_away_a_winning_position_is_a_miss():
    sf = sf_with("e2e4", 400, {"type": "cp", "value": -100})  # +400 best, +100 after → lost 300
    assert analyze_move_cp(sf, START, "a2a3", chess.WHITE)[1] == "Miss"


def test_a_big_loss_from_an_equal_position_is_a_blunder():
    sf = sf_with("e2e4", 0, {"type": "cp", "value": 300})
    assert analyze_move_cp(sf, START, "a2a3", chess.WHITE)[1] == "Blunder"


def test_black_perspective_is_normalised():
    fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    # Engine says side to move (black) is -30 with best e7e5; after black's best,
    # white-to-move eval is +30. From black's own view that's exactly best → 0 loss.
    sf = sf_with("e7e5", -30, {"type": "cp", "value": 30})
    cp_loss, cls, *_ = analyze_move_cp(sf, fen, "e7e5", chess.BLACK)
    assert cp_loss == 0
    assert cls == "Great move"
