"""
computer_engine.py — MAVERICK. The one rule that must never break:
for any position with a legal move, every difficulty returns a legal move.
Uses the real style model on CPU and a fake Stockfish.
"""
import random

import chess
import pytest

import computer_engine
from computer_engine import get_computer_move
from tests.conftest import FakeStockfish

DIFFICULTIES = ['easy', 'medium', 'hard']


def random_positions(n, seed=7, max_plies=60):
    """Reproducible positions from random play, skipping finished games."""
    rng = random.Random(seed)
    positions = [chess.STARTING_FEN]
    while len(positions) < n:
        b = chess.Board()
        for _ in range(rng.randint(1, max_plies)):
            moves = list(b.legal_moves)
            if not moves:
                break
            b.push(rng.choice(moves))
        if not b.is_game_over():
            positions.append(b.fen())
    return positions


SPECIAL = {
    'promotion available': '8/P6k/8/8/8/8/8/K7 w - - 0 1',
    'castling available': 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
    'en passant available': 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
    'in check, one escape': '7k/8/8/8/8/8/6q1/7K w - - 0 1',  # only Kxg2
    'black to move': 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    'bare kings + pawn': '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1',
}


def assert_legal(fen, result, difficulty):
    board = chess.Board(fen)
    assert result is not None, f'{difficulty}: no move for {fen}'
    move = chess.Move.from_uci(result['uci'])
    assert move in board.legal_moves, f'{difficulty}: illegal {result["uci"]} in {fen}'
    assert result['san'] == board.san(move)
    assert result['difficulty'] == difficulty


# ── always legal ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize('difficulty', DIFFICULTIES)
def test_always_legal_without_stockfish(difficulty):
    for fen in random_positions(25) + list(SPECIAL.values()):
        assert_legal(fen, get_computer_move(fen, difficulty), difficulty)


@pytest.mark.parametrize('difficulty', DIFFICULTIES)
def test_always_legal_with_stockfish(stockfish, difficulty):
    for fen in random_positions(25, seed=11) + list(SPECIAL.values()):
        assert_legal(fen, get_computer_move(fen, difficulty), difficulty)


@pytest.mark.parametrize('difficulty', DIFFICULTIES)
def test_always_legal_without_the_style_model(monkeypatch, stockfish, difficulty):
    monkeypatch.setattr(computer_engine, '_load_model', lambda: None)
    for fen in random_positions(10, seed=3):
        assert_legal(fen, get_computer_move(fen, difficulty), difficulty)


def test_legal_with_no_model_and_no_engine(monkeypatch):
    monkeypatch.setattr(computer_engine, '_load_model', lambda: None)
    for fen in random_positions(10, seed=5):
        assert_legal(fen, get_computer_move(fen, 'medium'), 'medium')


# ── input handling ───────────────────────────────────────────────────────────

def test_invalid_fen_raises_value_error():
    with pytest.raises(ValueError):
        get_computer_move('definitely not a fen', 'easy')


@pytest.mark.parametrize('fen', [
    'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',  # checkmated
    '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',                                    # stalemate
])
def test_finished_game_returns_none(fen):
    assert get_computer_move(fen, 'hard') is None


@pytest.mark.parametrize('given', [None, '', 'impossible', 'MEDIUM'])
def test_unknown_or_missing_difficulty_plays_medium(given):
    assert get_computer_move(chess.STARTING_FEN, given)['difficulty'] == 'medium'


def test_difficulty_is_case_insensitive():
    assert get_computer_move(chess.STARTING_FEN, 'HARD')['difficulty'] == 'hard'


# ── engine supervision ───────────────────────────────────────────────────────

def test_hard_takes_a_forced_mate(stockfish):
    # White mates with Qh7#? Use a simple back-rank mate: Ra8#.
    fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
    mate = chess.Move.from_uci('a1a8')
    stockfish.instance = FakeStockfish(best=lambda b: mate if b.fen() == fen else next(iter(b.legal_moves), None),
                                       top_cp=lambda b: {'Mate': 1} if b.fen() == fen else 0)
    for difficulty in ('medium', 'hard'):
        assert get_computer_move(fen, difficulty)['uci'] == 'a1a8'


def test_medium_vetoes_a_style_move_that_blunders(monkeypatch, stockfish):
    fen = chess.STARTING_FEN
    style_choice = chess.Move.from_uci('f2f3')
    engine_best = chess.Move.from_uci('e2e4')
    monkeypatch.setattr(computer_engine, '_model_move_ranking', lambda f: [(style_choice, 0.9), (engine_best, 0.1)])

    def evaluate(board):
        # After f2f3 the opponent is +500 (we are -500); after e2e4 it's level.
        return {'type': 'cp', 'value': 500 if board.piece_at(chess.F3) else 0}

    stockfish.instance = FakeStockfish(best=lambda b: engine_best, evaluate=evaluate, top_cp=20)
    assert get_computer_move(fen, 'medium')['uci'] == 'e2e4'


def test_medium_keeps_the_style_move_when_it_is_sound(monkeypatch, stockfish):
    style_choice = chess.Move.from_uci('d2d4')
    monkeypatch.setattr(computer_engine, '_model_move_ranking', lambda f: [(style_choice, 0.8)])
    stockfish.instance = FakeStockfish(best=lambda b: chess.Move.from_uci('e2e4'), top_cp=20,
                                       evaluate=lambda b: {'type': 'cp', 'value': -10})
    assert get_computer_move(chess.STARTING_FEN, 'medium')['uci'] == 'd2d4'


def test_easy_sampling_is_reproducible_with_a_seed():
    import numpy as np
    np.random.seed(123)
    first = get_computer_move(chess.STARTING_FEN, 'easy')['uci']
    np.random.seed(123)
    assert get_computer_move(chess.STARTING_FEN, 'easy')['uci'] == first


def test_model_ranking_covers_only_legal_queen_or_normal_moves():
    fen = SPECIAL['promotion available']
    ranked = computer_engine._model_move_ranking(fen)
    board = chess.Board(fen)
    assert ranked, 'style model should be loaded from style_model.pt'
    for mv, p in ranked:
        assert mv in board.legal_moves
        assert mv.promotion in (None, chess.QUEEN)
        assert 0.0 <= p <= 1.0
    assert sum(p for _, p in ranked) == pytest.approx(1.0, abs=1e-4)
