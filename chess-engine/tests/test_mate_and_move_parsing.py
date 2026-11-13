"""
G20: (a) a forced mate on the engine's top line is worth +/-MATE_CP, not 0;
(b) a played move is read as UCI first and as SAN only when it is not a legal
UCI move, so a 4-5 character SAN move (Nbd7, exd5, O-O-O) is understood.

Perspective: the `stockfish` package reports top-line scores from WHITE's point
of view (positive Centipawn / Mate = good for White). `top_line_cp` keeps that
perspective; `_best_cp_for_mover` turns it into the mover's.
"""

import chess
import pytest

from services.analysis import MATE_CP, _best_cp_for_mover, analyze_move_cp, parse_played_move, top_line_cp
from tests.conftest import FakeStockfish

START = chess.STARTING_FEN
# 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5: both black knights can reach d7.
QGD = "rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq - 3 4"
# 1. e4 d5: white can capture exd5.
SCANDI = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2"
CASTLE_BOTH = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1"
PROMOTE = "1n5k/P7/8/8/8/8/8/K7 w - - 0 1"
EN_PASSANT = "rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3"
SCHOLARS = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"
TWO_ROOKS = "4k3/8/8/8/8/8/8/R3K2R w - - 0 1"  # Rad1 / Rhf1 need a file
BACK_RANK = "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1"  # Ra8#

# ── (a) top_line_cp ──────────────────────────────────────────────────────────


def test_mate_cp_is_ten_thousand_centipawns():
    assert MATE_CP == 10000


@pytest.mark.parametrize("cp", [0, 1, -1, 35, -280, 9999, -9999])
def test_a_centipawn_top_line_is_returned_unchanged(cp):
    assert top_line_cp({"Move": "e2e4", "Centipawn": cp, "Mate": None}) == cp


@pytest.mark.parametrize("mate", [1, 2, 5, 30])
def test_a_mate_for_white_is_plus_mate_cp(mate):
    assert top_line_cp({"Move": "e2e4", "Centipawn": None, "Mate": mate}) == MATE_CP


@pytest.mark.parametrize("mate", [-1, -2, -5, -30])
def test_a_mate_for_black_is_minus_mate_cp(mate):
    assert top_line_cp({"Move": "e2e4", "Centipawn": None, "Mate": mate}) == -MATE_CP


def test_a_centipawn_score_wins_over_a_mate_field():
    assert top_line_cp({"Move": "e2e4", "Centipawn": 12, "Mate": 3}) == 12


@pytest.mark.parametrize(
    "line", [{"Move": "e2e4", "Centipawn": None, "Mate": None}, {"Move": "e2e4"}, {"Move": "e2e4", "Mate": 0}]
)
def test_a_top_line_without_any_score_is_zero(line):
    assert top_line_cp(line) == 0


# ── (a) _best_cp_for_mover ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    "line,color,expected",
    [
        ({"Centipawn": 40, "Mate": None}, chess.WHITE, 40),
        ({"Centipawn": 40, "Mate": None}, chess.BLACK, -40),
        ({"Centipawn": -40, "Mate": None}, chess.BLACK, 40),
        ({"Centipawn": 0, "Mate": None}, chess.BLACK, 0),
        ({"Centipawn": None, "Mate": 2}, chess.WHITE, MATE_CP),  # White mates, White to move
        ({"Centipawn": None, "Mate": 2}, chess.BLACK, -MATE_CP),  # White mates, Black to move
        ({"Centipawn": None, "Mate": -2}, chess.BLACK, MATE_CP),  # Black mates, Black to move
        ({"Centipawn": None, "Mate": -2}, chess.WHITE, -MATE_CP),  # Black mates, White to move
    ],
)
def test_best_score_is_from_the_movers_point_of_view(line, color, expected):
    assert _best_cp_for_mover([{"Move": "a2a3", **line}], color) == expected


@pytest.mark.parametrize("color", [chess.WHITE, chess.BLACK])
def test_best_score_without_a_top_line_is_zero(color):
    assert _best_cp_for_mover([], color) == 0


def test_only_the_first_line_counts():
    lines = [{"Move": "a2a3", "Centipawn": None, "Mate": 1}, {"Move": "h2h3", "Centipawn": -500, "Mate": None}]
    assert _best_cp_for_mover(lines, chess.WHITE) == MATE_CP


# ── (a) analyze_move_cp with a mate on the top line ──────────────────────────


def mate_sf(best_uci, mate, after):
    """
    Top line is a forced mate in `mate` for the side to move (as the Stockfish binary
    prints it; FakeStockfish converts to White's view like the package); `after` is
    the binary's eval once the move is played (side to move then).
    """
    return FakeStockfish(best=lambda b: chess.Move.from_uci(best_uci), top_cp={"Mate": mate}, evaluate=lambda b: after)


def test_playing_the_mating_move_is_the_best_move_not_a_brilliancy():
    sf = mate_sf("a1a8", 1, {"type": "mate", "value": 0})
    cp_loss, cls, _eb, ea, ebest, best, played, acc = analyze_move_cp(sf, BACK_RANK, "a1a8", chess.WHITE)
    assert (ebest, ea, cp_loss) == (MATE_CP, MATE_CP, 0)  # was ebest == 0 -> "Brilliant"
    assert cls == "Great move"
    assert (best, played) == ("a1a8", "a1a8")
    assert acc == 100.0


def test_missing_a_forced_mate_costs_the_mate():
    # White has mate in 1 but plays Kd2; afterwards White is "only" +50.
    sf = mate_sf("a1a8", 1, {"type": "cp", "value": -50})
    cp_loss, cls, _eb, ea, ebest, *_ = analyze_move_cp(sf, BACK_RANK, "e1d2", chess.WHITE)
    assert (ebest, ea) == (MATE_CP, 50)
    assert cp_loss == MATE_CP - 50  # was 0, classified "Brilliant"
    assert cls == "Miss"


def test_black_to_move_with_a_mate_for_black_on_the_top_line():
    # Black to move mates in 2 (the binary prints "mate 2"; the package reports Mate -2)
    # but plays ...Ke7; afterwards White (to move) is +80, so Black is -80.
    fen = "4k2r/8/8/8/8/8/5PPP/6K1 b k - 0 1"
    sf = mate_sf("h8h3", 2, {"type": "cp", "value": 80})
    cp_loss, cls, _eb, ea, ebest, *_ = analyze_move_cp(sf, fen, "e8e7", chess.BLACK)
    assert (ebest, ea) == (MATE_CP, -80)
    assert cp_loss == MATE_CP + 80
    assert cls == "Miss"


def test_the_best_defence_when_being_mated_is_not_a_blunder():
    # White is getting mated whatever it plays (top line: White to move is mated in 3).
    sf = mate_sf("e1d2", -3, {"type": "mate", "value": 2})
    cp_loss, cls, _eb, ea, ebest, *_ = analyze_move_cp(sf, BACK_RANK, "e1d2", chess.WHITE)
    assert (ebest, ea, cp_loss) == (-MATE_CP, -MATE_CP, 0)  # was ebest == 0 -> cp_loss 10000, "Blunder"
    assert cls == "Great move"


# ── (b) parse_played_move ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "fen,text,uci",
    [
        # UCI
        (START, "e2e4", "e2e4"),
        (START, "g1f3", "g1f3"),
        (PROMOTE, "a7a8q", "a7a8q"),
        (PROMOTE, "a7a8n", "a7a8n"),
        (PROMOTE, "a7b8r", "a7b8r"),
        (CASTLE_BOTH, "e1g1", "e1g1"),
        (CASTLE_BOTH, "e1c1", "e1c1"),
        (EN_PASSANT, "d4e3", "d4e3"),
        # SAN, 2-3 characters (worked before)
        (START, "e4", "e2e4"),
        (START, "Nf3", "g1f3"),
        (CASTLE_BOTH, "O-O", "e1g1"),
        # SAN, 4 characters (was parsed as UCI and failed)
        (QGD, "Nbd7", "b8d7"),
        (QGD, "Nfd7", "f6d7"),
        (SCANDI, "exd5", "e4d5"),
        (EN_PASSANT, "dxe3", "d4e3"),
        (PROMOTE, "a8=Q", "a7a8q"),
        (PROMOTE, "a8=N", "a7a8n"),
        (TWO_ROOKS, "Rad1", "a1d1"),
        (TWO_ROOKS, "Rhf1", "h1f1"),
        (SCHOLARS, "Qxf7", "h5f7"),
        (SCHOLARS, "Qh4", "h5h4"),
        (BACK_RANK, "Ra8+", "a1a8"),
        (BACK_RANK, "Ra8#", "a1a8"),
        # SAN, 5 characters (was parsed as UCI and failed)
        (CASTLE_BOTH, "O-O-O", "e1c1"),
        (CASTLE_BOTH, "0-0-0", "e1c1"),
        (SCHOLARS, "Qxf7#", "h5f7"),
        (SCHOLARS, "Qxf7+", "h5f7"),
        (SCANDI, "e4xd5", "e4d5"),
        (PROMOTE, "a8=Q+", "a7a8q"),
        (START, "Ng1f3", "g1f3"),
        # SAN, longer
        (PROMOTE, "axb8=Q", "a7b8q"),
        (PROMOTE, "axb8=R+", "a7b8r"),
        # surrounding whitespace
        (START, " e2e4 ", "e2e4"),
        (QGD, "Nbd7\n", "b8d7"),
    ],
)
def test_parse_played_move(fen, text, uci):
    assert parse_played_move(chess.Board(fen), text) == chess.Move.from_uci(uci)


@pytest.mark.parametrize(
    "fen,text",
    [
        (START, ""),
        (START, "   "),
        (START, "zz9"),
        (START, "nonsense"),
        (START, "e2e5"),  # UCI-shaped, illegal
        (START, "e7e5"),  # the other side's move
        (START, "Nbd7"),  # SAN-shaped, illegal here
        (START, "exd5"),
        (START, "O-O"),  # castling not possible yet
        (START, "O-O-O"),
        (QGD, "Nd7"),  # ambiguous: either knight
        (PROMOTE, "a7a8"),  # promotion piece required
        (PROMOTE, "a8"),
        (START, "E2E4"),
        # null moves are not moves a player can make
        (START, "0000"),
        (START, "--"),
        (START, "Z0"),
    ],
)
def test_parse_played_move_returns_none_for_anything_that_is_not_a_legal_move(fen, text):
    assert parse_played_move(chess.Board(fen), text) is None


def test_parse_played_move_does_not_change_the_board():
    board = chess.Board(QGD)
    parse_played_move(board, "Nbd7")
    parse_played_move(board, "b8d7")
    parse_played_move(board, "garbage")
    assert board.fen() == QGD


def test_uci_and_san_spellings_of_every_legal_move_agree():
    for fen in (START, QGD, SCANDI, CASTLE_BOTH, PROMOTE, EN_PASSANT, SCHOLARS, TWO_ROOKS, BACK_RANK):
        board = chess.Board(fen)
        for move in board.legal_moves:
            assert parse_played_move(board, move.uci()) == move
            assert parse_played_move(board, board.san(move)) == move
            assert parse_played_move(board, board.lan(move)) == move


# ── (b) analyze_move_cp / the endpoint with a 4-5 character SAN move ─────────


def flat_sf(best_uci):
    return FakeStockfish(
        best=lambda b: chess.Move.from_uci(best_uci), top_cp=0, evaluate=lambda b: {"type": "cp", "value": 0}
    )


@pytest.mark.parametrize(
    "fen,san,uci,color",
    [
        (QGD, "Nbd7", "b8d7", chess.BLACK),
        (SCANDI, "exd5", "e4d5", chess.WHITE),
        (CASTLE_BOTH, "O-O-O", "e1c1", chess.WHITE),
        (SCHOLARS, "Qxf7#", "h5f7", chess.WHITE),
    ],
)
def test_a_four_or_five_character_san_move_is_analysed_like_its_uci_spelling(fen, san, uci, color):
    by_san = analyze_move_cp(flat_sf(uci), fen, san, color)
    by_uci = analyze_move_cp(flat_sf(uci), fen, uci, color)
    assert by_san == by_uci
    assert by_san[1] == "Great move"  # was "Mistake"
    assert by_san[6] == uci  # was None


def test_classify_move_endpoint_accepts_a_four_character_san_move(client, stockfish):
    stockfish.instance = flat_sf("b8d7")
    data = client.post("/classify-move", json={"fen": QGD, "move": "Nbd7"}).json()
    assert data == {"classification": "Great move", "cp_loss": 0, "best_move": "b8d7"}
