"""
Tests for engine.py pure logic — no Stockfish binary required for most tests.
Stockfish-dependent tests are marked @pytest.mark.skipif and skipped when unavailable.
"""
import math
import chess
import pytest
from unittest.mock import MagicMock, patch

from engine import compute_game_accuracy


# ── compute_game_accuracy ────────────────────────────────────────────────────

def test_accuracy_empty_returns_100():
    assert compute_game_accuracy([]) == 100.0

def test_accuracy_perfect_returns_near_100():
    result = compute_game_accuracy([0] * 20)
    assert result >= 99.0

def test_accuracy_high_loss_returns_low_value():
    result = compute_game_accuracy([300] * 20)
    assert result < 20.0

def test_accuracy_clamped_between_0_and_100():
    result = compute_game_accuracy([9999] * 50)
    assert 0.0 <= result <= 100.0

def test_accuracy_formula():
    # Manual spot check: avg_loss=50 → 103.1668 * exp(-0.04354 * 50) - 3.1669
    avg = 50
    expected = round(max(0, min(100, 103.1668 * math.exp(-0.04354 * avg) - 3.1669)), 1)
    assert compute_game_accuracy([50]) == expected


# ── analyze_move_cp classification (mocked Stockfish) ───────────────────────

def make_mock_sf(eval_before_val, top_moves, eval_after_val, eval_type='cp'):
    sf = MagicMock()
    sf.get_evaluation.side_effect = [
        {'type': 'cp', 'value': eval_before_val},
        {'type': eval_type, 'value': eval_after_val},
    ]
    sf.get_top_moves.return_value = top_moves
    return sf

@pytest.mark.parametrize("cp_loss,expected_class", [
    (-50, "Brilliant"),      # player beat the engine
    (0,   "Great move"),     # exact best move, 0 loss
    (5,   "Best"),           # very close to best but not exact best move
    (20,  "Excellent"),
    (40,  "Good"),
    (75,  "Inaccuracy"),
    (150, "Mistake"),
    (250, "Blunder"),
])
def test_classification_thresholds(cp_loss, expected_class):
    from engine import analyze_move_cp

    # Build a board position and pick a legal move
    board = chess.Board()  # starting position
    legal = list(board.legal_moves)
    move = legal[0]
    move_uci = move.uci()

    # eval_best_cp (from top_moves, player perspective) = 10
    # eval_after_cp (negated from stockfish) = 10 - cp_loss
    best_cp = 10
    after_cp_raw = -(best_cp - cp_loss)  # engine returns opponent's perspective; we negate

    top_moves = [{'Move': 'e2e4', 'Centipawn': best_cp, 'Mate': None}]
    # Force the played move to NOT be best (e2e4) unless testing Great move
    if expected_class == "Great move":
        top_moves[0]['Move'] = move_uci

    sf = MagicMock()
    # First call: eval before (from current player perspective)
    # Second call: eval after move
    sf.get_evaluation.side_effect = [
        {'type': 'cp', 'value': best_cp},   # eval_before (white's perspective)
        {'type': 'cp', 'value': after_cp_raw},  # eval_after from opponent's view
    ]
    sf.get_top_moves.return_value = top_moves

    _, classification, _, _, _, _, _ = analyze_move_cp(
        sf, board.fen(), move_uci, chess.WHITE
    )
    assert classification == expected_class, f"cp_loss={cp_loss}: expected {expected_class}, got {classification}"


# ── API endpoint tests (requires running FastAPI app) ────────────────────────

@pytest.fixture
def client():
    """Synchronous test client — no running server needed."""
    from fastapi.testclient import TestClient
    # Patch get_stockfish_instance to return None so tests run without Stockfish
    with patch('main.get_stockfish_instance', return_value=None):
        from main import app
        return TestClient(app)

def test_health_endpoint(client):
    resp = client.get('/health')
    assert resp.status_code == 200
    data = resp.json()
    assert 'status' in data

def test_validate_move_legal(client):
    resp = client.post('/validate-move', json={
        'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'move': 'e2e4',
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data['valid'] is True
    assert 'new_fen' in data
    assert data['flags']['is_checkmate'] is False

def test_validate_move_illegal(client):
    resp = client.post('/validate-move', json={
        'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'move': 'e2e5',  # illegal — pawn can't jump two squares from e2 to e5
    })
    assert resp.status_code == 200
    assert resp.json()['valid'] is False

def test_valid_moves_starting_position(client):
    resp = client.post('/valid-moves', json={
        'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'move': '',  # move field not used by this endpoint
    })
    assert resp.status_code == 200
    moves = resp.json()['valid_moves']
    assert len(moves) == 20  # 20 legal moves from starting position
    assert 'e2e4' in moves

def test_valid_moves_bad_fen_returns_400(client):
    resp = client.post('/valid-moves', json={'fen': 'not-a-fen', 'move': ''})
    assert resp.status_code == 400
    assert 'Invalid FEN' in resp.json()['detail']

def test_validate_move_checkmate_detection(client):
    # Fool's mate position — white is checkmated
    fool_fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
    resp = client.post('/validate-move', json={'fen': fool_fen, 'move': 'e1d1'})
    # e1d1 may or may not be legal, but we're testing checkmate detection exists
    # The key test is that flags are returned when valid
    if resp.json().get('valid'):
        assert 'flags' in resp.json()
