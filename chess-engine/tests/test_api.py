"""
main.py — the engine's HTTP API, with Stockfish faked and Supabase stubbed.
"""
import chess
import pytest

import main
from tests.conftest import FakeStockfish

START = chess.STARTING_FEN


# ── health / validation ──────────────────────────────────────────────────────

def test_health_reports_engine_unavailable(client):
    assert client.get('/health').json() == {'status': 'ok', 'engine': 'Engine unavailable'}


def test_health_reports_engine_online(client, stockfish):
    assert client.get('/health').json()['engine'] == 'online'


@pytest.mark.parametrize('fen,move,expected', [
    (START, 'e2e4', True),
    (START, 'g1f3', True),
    (START, 'e2e5', False),
    (START, 'e7e5', False),                     # wrong side
    ('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8q', True),
    ('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8', False),  # promotion piece required
])
def test_validate_move(client, fen, move, expected):
    assert client.post('/validate-move', json={'fen': fen, 'move': move}).json()['valid'] is expected


def test_validate_move_returns_the_new_position_and_flags(client):
    data = client.post('/validate-move', json={
        'fen': 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'move': 'd8h4',
    }).json()
    assert data['valid'] is True
    assert data['flags'] == {'is_check': True, 'is_checkmate': True, 'is_stalemate': False, 'is_game_over': True}
    assert chess.Board(data['new_fen']).is_checkmate()


@pytest.mark.parametrize('fen,move', [('garbage', 'e2e4'), (START, 'nonsense'), (START, '')])
def test_validate_move_never_500s_on_bad_input(client, fen, move):
    res = client.post('/validate-move', json={'fen': fen, 'move': move})
    assert res.status_code == 200
    assert res.json()['valid'] is False


def test_validate_move_rejects_a_missing_field(client):
    assert client.post('/validate-move', json={'fen': START}).status_code == 422


# ── /computer-move (MAVERICK) ────────────────────────────────────────────────

def test_computer_move_returns_a_legal_move(client):
    data = client.post('/computer-move', json={'fen': START, 'difficulty': 'easy'}).json()
    assert chess.Move.from_uci(data['uci']) in chess.Board(START).legal_moves
    assert data['difficulty'] == 'easy'


def test_computer_move_defaults_to_medium(client):
    assert client.post('/computer-move', json={'fen': START}).json()['difficulty'] == 'medium'


def test_computer_move_bad_fen_is_400(client):
    res = client.post('/computer-move', json={'fen': 'nope'})
    assert res.status_code == 400
    assert 'Invalid FEN' in res.json()['detail']


def test_computer_move_on_a_finished_game_is_422(client):
    mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
    assert client.post('/computer-move', json={'fen': mated}).status_code == 422


# ── /style-move ──────────────────────────────────────────────────────────────

def test_style_move_health(client):
    assert client.get('/style-move/health').json() == {'model_loaded': True}


def test_style_move_returns_ranked_legal_candidates(client):
    data = client.post('/style-move', json={'fen': START, 'top_k': 5}).json()
    board = chess.Board(START)
    assert 1 <= len(data['candidates']) <= 5
    assert data['top_move'] == data['candidates'][0]
    confidences = [c['confidence'] for c in data['candidates']]
    assert confidences == sorted(confidences, reverse=True)
    for c in data['candidates']:
        assert chess.Move.from_uci(c['uci']) in board.legal_moves


def test_style_move_bad_fen_is_400(client):
    assert client.post('/style-move', json={'fen': 'bad'}).status_code == 400


# ── engine-backed endpoints ──────────────────────────────────────────────────

def test_analyze_without_engine_is_503(client):
    assert client.post('/analyze', json={'fen': START}).status_code == 503


def test_analyze_returns_best_move_eval_and_lines(client, stockfish):
    stockfish.instance = FakeStockfish(best=lambda b: chess.Move.from_uci('e2e4'), top_cp=35,
                                       evaluate=lambda b: {'type': 'cp', 'value': 35})
    data = client.post('/analyze', json={'fen': START, 'depth': 12}).json()
    assert data == {
        'best_move': 'e2e4',
        'evaluation': {'type': 'cp', 'value': 35},
        'lines': [{'move': 'e2e4', 'centipawn': 35, 'mate': None}],
    }
    assert stockfish.instance.depth == 12


def test_classify_move_without_engine_is_503(client):
    assert client.post('/classify-move', json={'fen': START, 'move': 'e2e4'}).status_code == 503


def test_classify_move(client, stockfish):
    stockfish.instance = FakeStockfish(best=lambda b: chess.Move.from_uci('e2e4'), top_cp=30,
                                       evaluate=lambda b: {'type': 'cp', 'value': -30})
    data = client.post('/classify-move', json={'fen': START, 'move': 'e2e4'}).json()
    assert data == {'classification': 'Great move', 'cp_loss': 0, 'best_move': 'e2e4'}


def test_valid_moves_after_e4(client):
    fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    moves = client.post('/valid-moves', json={'fen': fen, 'move': ''}).json()['valid_moves']
    assert len(moves) == 20
    assert all(m[1] in '78' for m in moves)  # black pieces/pawns only


# ── /analyse-game (post-game review) ────────────────────────────────────────

PGN = '[Event "GAMBIT"]\n[Site "GAMBIT"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'


def test_analyse_game_without_engine_is_503(client):
    res = client.post('/analyse-game', json={'game_id': 'g1', 'pgn': PGN, 'time_control': '10'})
    assert res.status_code == 503


class FakeTable:
    def __init__(self, sink):
        self.sink = sink

    def update(self, payload):
        self.sink['update'] = payload
        return self

    def eq(self, col, val):
        self.sink['eq'] = (col, val)
        return self

    def execute(self):
        self.sink['executed'] = True


class FakeSupabase:
    def __init__(self):
        self.sink = {}

    def table(self, name):
        self.sink['table'] = name
        return FakeTable(self.sink)


def test_full_game_review_writes_accuracy_and_classifications(monkeypatch, stockfish):
    db = FakeSupabase()
    monkeypatch.setattr(main, 'supabase', db)
    main.run_full_game_analysis('g1', PGN)

    assert db.sink['table'] == 'games'
    assert db.sink['eq'] == ('id', 'g1')
    assert db.sink['executed'] is True
    update = db.sink['update']
    assert 0 <= update['white_accuracy'] <= 100
    assert 0 <= update['black_accuracy'] <= 100
    assert len(update['white_move_classifications']) == 3
    assert len(update['black_move_classifications']) == 3
    first = update['white_move_classifications'][0]
    assert first['san'] == 'e4' and first['ply'] == 0 and first['move_number'] == 1
    # Sound early moves are labelled as book.
    assert first['classification'] == 'Book'
    assert stockfish.released == 1  # engine returned to the pool


def test_full_game_review_endpoint_queues_work(client, stockfish, monkeypatch):
    calls = []
    monkeypatch.setattr(main, 'run_full_game_analysis', lambda gid, pgn: calls.append(gid))
    res = client.post('/analyse-game', json={'game_id': 'g9', 'pgn': PGN, 'time_control': '10'})
    assert res.json() == {'status': 'Analysis queued'}
    assert calls == ['g9']


def test_full_game_review_ignores_an_empty_pgn(monkeypatch, stockfish):
    db = FakeSupabase()
    monkeypatch.setattr(main, 'supabase', db)
    main.run_full_game_analysis('g1', '')
    assert 'update' not in db.sink
    assert stockfish.released == 1


def test_full_game_review_survives_a_database_error(monkeypatch, stockfish):
    class Broken:
        def table(self, _):
            raise RuntimeError('db down')
    monkeypatch.setattr(main, 'supabase', Broken())
    main.run_full_game_analysis('g1', PGN)  # must not raise
    assert stockfish.released == 1
