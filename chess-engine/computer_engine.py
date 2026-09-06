"""
MAVERICK computer opponent — combines the "plays like me" style policy net with
Stockfish supervision to produce a real, tunable difficulty ladder.

Difficulty is genuinely different in strength (not cosmetic):

  easy    : sample from the style model's move distribution with high temperature
            -> human-like, plays your style but makes real mistakes. No Stockfish.
  medium  : play the style model's top move, but a shallow Stockfish check vetoes
            outright blunders (cp loss > BLUNDER_CP) -> falls back to the model's
            best non-blunder candidate. Roughly "plays like you, minus the blunders".
  hard    : take the model's top-K candidates and let Stockfish re-rank them, then
            play the strongest -> never blunders, still style-flavoured.

If the style model is unavailable or returns nothing, MAVERICK falls back to a
Stockfish move (then a random legal move) so it never stalls.
"""

import random

import chess
import numpy as np
import torch

from model import encode_board, legal_move_mask
from style_engine import _load_model, _device
from engine import get_engine

BLUNDER_CP = 300           # medium: style move must stay within this loss, else engine best
HARD_MAX_LOSS = 50         # hard: style move must be near-best, else engine best
CONVERT_CP = 400           # |eval| at/above this (or any forced mate) -> convert with engine best
EASY_TEMPERATURE = 1.7     # >1 flattens the model distribution -> weaker/more random
TOPK = 5                   # model candidates considered by medium/hard
MEDIUM_DEPTH = 10
HARD_DEPTH = 14
FALLBACK_DEPTH = 12


def _model_move_ranking(fen: str):
    """
    Rank the position's legal moves by the style model's probability.

    Returns a list of (chess.Move, prob) sorted high->low, or None if the model
    isn't loaded. Under-promotions are dropped (the model's move space assumes
    queen promotion), so only queen promotions are kept.
    """
    model = _load_model()
    if model is None:
        return None

    board = chess.Board(fen)
    board_tensor = encode_board(fen)
    x = torch.from_numpy(board_tensor).unsqueeze(0).to(_device)
    with torch.no_grad():
        logits = model(x)[0]

    mask = legal_move_mask(fen)
    if mask.sum() == 0:
        return []

    mask_t = torch.from_numpy(mask).to(_device)
    probs = torch.softmax(logits.masked_fill(~mask_t, float("-inf")), dim=0).cpu().numpy()

    ranked = []
    for mv in board.legal_moves:
        if mv.promotion is not None and mv.promotion != chess.QUEEN:
            continue
        idx = mv.from_square * 64 + mv.to_square
        ranked.append((mv, float(probs[idx])))
    ranked.sort(key=lambda t: t[1], reverse=True)
    return ranked


def _temperature_sample(ranked, temperature: float) -> chess.Move:
    """Sample a move from the ranked distribution, flattened by `temperature`."""
    moves = [m for m, _ in ranked]
    p = np.array([prob for _, prob in ranked], dtype=np.float64)
    with np.errstate(divide="ignore", invalid="ignore"):
        adj = np.power(p, 1.0 / temperature)
    total = adj.sum()
    if not np.isfinite(total) or total <= 0:
        return random.choice(moves)
    adj = adj / total
    return moves[int(np.random.choice(len(moves), p=adj))]


def _cp_from_topmove(tm) -> int:
    """Centipawn score (side-to-move perspective) from a Stockfish top-move dict."""
    if tm.get("Centipawn") is not None:
        return tm["Centipawn"]
    if tm.get("Mate") is not None:
        return 10000 if tm["Mate"] > 0 else -10000
    return 0


def _analyze(fen: str, candidates, depth: int):
    """
    Run Stockfish on the position: return the engine's best move, the position's
    eval (mover's perspective), whether there's a forced mate, and each candidate
    move's cp_loss vs best. Returns None if Stockfish is unavailable.
    """
    with get_engine(depth) as sf:
        if sf is None:
            return None
        sf.set_fen_position(fen)
        top = sf.get_top_moves(1)
        if not top:
            return None
        best_uci = top[0]["Move"]
        is_mate = top[0].get("Mate") is not None
        best_cp = _cp_from_topmove(top[0])

        board = chess.Board(fen)
        losses = {}
        for mv in candidates:
            b = board.copy()
            b.push(mv)
            sf.set_fen_position(b.fen())
            ev = sf.get_evaluation()
            cp_after = ev["value"]
            if ev["type"] == "mate":
                cp_after = 10000 if cp_after > 0 else -10000
            cp_after = -cp_after  # opponent to move after our move -> flip to our view
            losses[mv.uci()] = max(0, best_cp - cp_after)
        return {"best_uci": best_uci, "best_cp": best_cp, "is_mate": is_mate, "losses": losses}


def _supervised_move(fen: str, ranked, style_max_loss: int, depth: int) -> chess.Move:
    """
    Play the user's style where it's sound, but hand control to Stockfish when it
    matters. Decisive positions (a forced mate, or clearly winning/losing) are
    converted with the engine's best move — this is what makes MAVERICK actually
    mate and convert instead of shuffling. In non-decisive positions it plays the
    highest-preference style move within `style_max_loss`, falling back to the
    engine's best over ALL legal moves if no style move qualifies.
    """
    candidates = [m for m, _ in ranked[:TOPK]]
    info = _analyze(fen, candidates, depth)
    if info is None:
        return ranked[0][0]  # engine down -> trust the model

    best_move = None
    try:
        best_move = chess.Move.from_uci(info["best_uci"])
    except ValueError:
        best_move = None

    # Decisive: convert / defend with the engine's best (accounts for mate distance).
    if best_move is not None and (info["is_mate"] or abs(info["best_cp"]) >= CONVERT_CP):
        return best_move

    # Otherwise keep style: best-preference model move within the loss budget.
    losses = info["losses"]
    for mv, _ in ranked[:TOPK]:
        if losses.get(mv.uci(), 10_000) <= style_max_loss:
            return mv

    # No acceptable style move -> engine's best over all legal moves.
    if best_move is not None:
        return best_move
    return min(candidates, key=lambda m: losses.get(m.uci(), 10_000))


def _medium_move(fen: str, ranked) -> chess.Move:
    return _supervised_move(fen, ranked, BLUNDER_CP, MEDIUM_DEPTH)


def _hard_move(fen: str, ranked) -> chess.Move:
    return _supervised_move(fen, ranked, HARD_MAX_LOSS, HARD_DEPTH)


def _fallback_move(fen: str):
    """Stockfish best move, else a random legal move. Never returns None if legal moves exist."""
    with get_engine(FALLBACK_DEPTH) as sf:
        if sf is not None:
            sf.set_fen_position(fen)
            best = sf.get_best_move()
            if best:
                try:
                    return chess.Move.from_uci(best)
                except ValueError:
                    pass
    legal = list(chess.Board(fen).legal_moves)
    return random.choice(legal) if legal else None


def get_computer_move(fen: str, difficulty: str = "medium"):
    """
    Return MAVERICK's move for `fen` at the given difficulty as
    {"uci", "san", "difficulty"}, or None if the game is over / no legal move.
    Raises ValueError on an invalid FEN.
    """
    try:
        board = chess.Board(fen)
    except ValueError:
        raise ValueError(f"Invalid FEN: {fen}")

    if board.is_game_over() or not any(board.legal_moves):
        return None

    difficulty = (difficulty or "medium").lower()
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"

    ranked = _model_move_ranking(fen)

    if not ranked:
        move = _fallback_move(fen)
    elif difficulty == "easy":
        move = _temperature_sample(ranked, EASY_TEMPERATURE)
    elif difficulty == "hard":
        move = _hard_move(fen, ranked)
    else:
        move = _medium_move(fen, ranked)

    if move is None:
        return None

    return {"uci": move.uci(), "san": board.san(move), "difficulty": difficulty}
