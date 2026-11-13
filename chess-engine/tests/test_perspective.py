"""
ENG-PERSPECTIVE: one evaluation perspective for reviews, /classify-move and MAVERICK.

The `stockfish` package reports every score from WHITE's point of view
(services/perspective.py cites the package lines). FakeStockfish models that
conversion, so these tests exercise the same chain as production: Stockfish
binary (side to move) -> package (White) -> perspective helpers (mover).
"""

import chess
import pytest

import computer_engine
import main
from services.analysis import analyze_move_cp
from services.perspective import (
    CP_LIMIT,
    MATE_CP,
    clamp_cp,
    evaluation_for,
    for_color,
    line_white_score,
    white_score,
)
from tests.conftest import FakeStockfish, material_engine

START = chess.STARTING_FEN
AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
SCHOLARS = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"  # Qxf7#
FOOLS = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"  # ...Qh4#
OPENING_EVAL = 30  # what Stockfish says White's first-move edge is worth


def cp(value):
    return {"type": "cp", "value": value}


def mate(value):
    return {"type": "mate", "value": value}


# ── the pure helpers ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "evaluation,white_to_move,expected",
    [
        (cp(35), True, 35),
        (cp(35), False, 35),  # the package already reports White's view: no flip by side to move
        (cp(-120), False, -120),
        (mate(3), True, MATE_CP),  # White mates
        (mate(3), False, MATE_CP),
        (mate(-2), True, -MATE_CP),  # Black mates
        (mate(-2), False, -MATE_CP),
        (mate(0), True, -MATE_CP),  # White to move and checkmated
        (mate(0), False, MATE_CP),  # Black to move and checkmated
        (cp(25000), True, CP_LIMIT),  # a centipawn score never reaches a mate
        (cp(-25000), False, -CP_LIMIT),
    ],
)
def test_white_score(evaluation, white_to_move, expected):
    assert white_score(evaluation, white_to_move) == expected


def test_an_unknown_evaluation_type_is_an_error():
    with pytest.raises(ValueError):
        white_score({"type": "wdl", "value": 1}, True)


@pytest.mark.parametrize(
    "line,expected",
    [
        ({"Centipawn": 40, "Mate": None}, 40),
        ({"Centipawn": -40, "Mate": None}, -40),
        ({"Centipawn": None, "Mate": 1}, MATE_CP),
        ({"Centipawn": None, "Mate": -4}, -MATE_CP),
        ({"Centipawn": 99999, "Mate": None}, CP_LIMIT),
        ({"Centipawn": None, "Mate": None}, 0),
    ],
)
def test_line_white_score(line, expected):
    assert line_white_score({"Move": "e2e4", **line}) == expected


@pytest.mark.parametrize("value", [0, 17, -300, MATE_CP, -MATE_CP])
def test_for_color_is_identity_for_white_and_negation_for_black_and_its_own_inverse(value):
    assert for_color(value, chess.WHITE) == value
    assert for_color(value, chess.BLACK) == -value
    assert for_color(for_color(value, chess.BLACK), chess.BLACK) == value


def test_clamp_keeps_ordinary_scores():
    assert clamp_cp(250) == 250 and clamp_cp(-250) == -250


@pytest.mark.parametrize(
    "fen,evaluation,color,expected",
    [
        (AFTER_E4, cp(30), chess.WHITE, 30),  # Black to move, White is better
        (AFTER_E4, cp(30), chess.BLACK, -30),
        (START, mate(0), chess.BLACK, MATE_CP),  # (artificial) White to move is mated: Black won
        (START, mate(0), chess.WHITE, -MATE_CP),
    ],
)
def test_evaluation_for(fen, evaluation, color, expected):
    assert evaluation_for(evaluation, chess.Board(fen), color) == expected


# ── a known good move by each colour ─────────────────────────────────────────


def opening_engine():
    """White is +OPENING_EVAL in every position (reported for the side to move, as UCI does)."""

    def side_to_move(board):
        return OPENING_EVAL if board.turn == chess.WHITE else -OPENING_EVAL

    return FakeStockfish(
        best=lambda b: chess.Move.from_uci("e2e4" if b.turn == chess.WHITE else "e7e5"),
        evaluate=lambda b: cp(side_to_move(b)),
        top_cp=side_to_move,
    )


def test_1_e4_is_the_best_move_for_white_not_an_inaccuracy():
    cp_loss, cls, eb, ea, ebest, best, played, acc = analyze_move_cp(opening_engine(), START, "e2e4", chess.WHITE)
    assert (cp_loss, cls, acc) == (0, "Great move", 100.0)  # was cp_loss 60, "Inaccuracy"
    assert (eb, ea, ebest) == (OPENING_EVAL, OPENING_EVAL, OPENING_EVAL)


def test_1_e5_is_the_best_move_for_black():
    cp_loss, cls, eb, ea, ebest, *_rest, acc = analyze_move_cp(opening_engine(), AFTER_E4, "e7e5", chess.BLACK)
    assert (cp_loss, cls, acc) == (0, "Great move", 100.0)
    assert (eb, ea, ebest) == (-OPENING_EVAL, -OPENING_EVAL, -OPENING_EVAL)


@pytest.mark.parametrize("fen,move,color", [(SCHOLARS, "h5f7", chess.WHITE), (FOOLS, "d8h4", chess.BLACK)])
def test_delivering_mate_is_the_best_move_for_either_colour(fen, move, color):
    cp_loss, cls, _eb, ea, ebest, *_rest, acc = analyze_move_cp(material_engine(), fen, move, color)
    assert ea == MATE_CP  # the opponent is mated: a win for the mover
    assert cp_loss == 0 and cls not in ("Blunder", "Miss", "Mistake") and acc == 100.0


@pytest.mark.parametrize("color", [chess.WHITE, chess.BLACK])
def test_walking_into_a_mate_is_a_blunder_for_either_colour(color):
    # The engine (side to move) mates in 1 after the played move.
    board = chess.Board(START) if color == chess.WHITE else chess.Board(AFTER_E4)
    sf = FakeStockfish(
        best=lambda b: next(iter(b.legal_moves)),
        evaluate=lambda b: mate(1) if b.turn != color else cp(0),
        top_cp=0,
    )
    move = next(iter(board.legal_moves)).uci()
    cp_loss, cls, _eb, ea, *_ = analyze_move_cp(sf, board.fen(), move, color)
    assert ea == -MATE_CP
    assert cls == "Blunder" and cp_loss == MATE_CP


# ── the eval graph is White's view ───────────────────────────────────────────

# 1. e4 d5 2. exd5 Qxd5: White wins a pawn, then Black wins it back.
PAWN_TRADE_PGN = '[Event "GAMBIT"]\n\n1. e4 d5 2. exd5 Qxd5 *'
GAME_ID = "11111111-1111-4111-8111-111111111111"


def review_of(pgn, monkeypatch, engine_switch):
    import services.review as review

    engine_switch.instance = material_engine()
    captured = {}
    monkeypatch.setattr(review, "save_review", lambda _seams, _gid, update: captured.update(update) or True)
    main.run_full_game_analysis(GAME_ID, pgn)
    return captured


def test_the_eval_graph_is_positive_when_white_is_better(monkeypatch, engine_switch):
    update = review_of(PAWN_TRADE_PGN, monkeypatch, engine_switch)
    white, black = update["white_move_classifications"], update["black_move_classifications"]
    # After 2. exd5 White is a pawn up: the graph goes up (EvalGraph.tsx draws +eval_white above the middle).
    assert white[1]["san"] == "exd5" and white[1]["eval_white"] > 0
    # After 2... Qxd5 material is level again.
    assert black[1]["san"] == "Qxd5" and black[1]["eval_white"] == 0
    for entry in white:
        assert entry["eval_white"] == entry["eval_after"]
    for entry in black:
        assert entry["eval_white"] == -entry["eval_after"]


def test_a_review_scores_good_moves_of_both_sides_as_sound(monkeypatch, engine_switch):
    update = review_of(PAWN_TRADE_PGN, monkeypatch, engine_switch)
    exd5 = update["white_move_classifications"][1]
    qxd5 = update["black_move_classifications"][1]
    assert exd5["cp_loss"] == 0 and qxd5["cp_loss"] == 0
    assert exd5["accuracy"] == 100.0 and qxd5["accuracy"] == 100.0


# ── MAVERICK plays the move that is best for ITS side ────────────────────────

# White to move, level material: the style model's favourite Ne4 hangs the knight to ...dxe4.
HANG_WHITE = "6nk/8/8/3p4/8/8/3N3P/4K3 w - - 0 1"
HANG_WHITE_STYLE, HANG_WHITE_SAFE = "d2e4", "h2h3"
# White to move: Black's knight on e5 hangs to dxe5; the style model's favourite ignores it.
GIFT_WHITE = "4k3/8/8/4n3/3P4/8/7P/4K3 w - - 0 1"
GIFT_WHITE_STYLE, GIFT_WHITE_TAKE = "h2h3", "d4e5"


def mirrored(fen, *moves):
    """The same position with colours swapped (Black to move) and the same moves, mirrored."""
    board = chess.Board(fen).mirror()
    flipped = []
    for uci in moves:
        mv = chess.Move.from_uci(uci)
        flipped.append(chess.Move(chess.square_mirror(mv.from_square), chess.square_mirror(mv.to_square)).uci())
    return (board.fen(), *flipped)


CASES = {
    "white avoids hanging a knight": (HANG_WHITE, HANG_WHITE_STYLE, HANG_WHITE_SAFE),
    "black avoids hanging a knight": mirrored(HANG_WHITE, HANG_WHITE_STYLE, HANG_WHITE_SAFE),
    "white takes a free knight": (GIFT_WHITE, GIFT_WHITE_STYLE, GIFT_WHITE_TAKE),
    "black takes a free knight": mirrored(GIFT_WHITE, GIFT_WHITE_STYLE, GIFT_WHITE_TAKE),
}


@pytest.mark.parametrize("name", list(CASES))
def test_maverick_hard_plays_the_move_that_is_best_for_its_own_side(name, monkeypatch, stockfish):
    fen, style_move, right_move = CASES[name]
    board = chess.Board(fen)
    style, right = chess.Move.from_uci(style_move), chess.Move.from_uci(right_move)
    assert style in board.legal_moves and right in board.legal_moves
    monkeypatch.setattr(computer_engine, "_model_move_ranking", lambda _fen: [(style, 0.9), (right, 0.1)])
    stockfish.instance = material_engine(depth=1)  # sees the recapture
    assert computer_engine.get_computer_move(fen, "hard")["uci"] == right_move


@pytest.mark.parametrize("name", list(CASES))
def test_maverick_losses_are_from_its_own_point_of_view(name, stockfish):
    fen, style_move, right_move = CASES[name]
    stockfish.instance = material_engine(depth=1)
    info = computer_engine._analyze(fen, [chess.Move.from_uci(style_move), chess.Move.from_uci(right_move)], 1)
    assert info["losses"][right_move] == 0
    assert info["losses"][style_move] > computer_engine.HARD_MAX_LOSS
