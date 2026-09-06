import os
import math
import logging
import threading
import chess
import chess.engine
from stockfish import Stockfish

logging.getLogger("stockfish").setLevel(logging.ERROR)

STOCKFISH_PATH = os.environ.get("STOCKFISH_PATH")
POOL_SIZE = int(os.environ.get("STOCKFISH_POOL_SIZE", "4"))

# C7 fix: Object pool — each thread gets its own Stockfish instance, preventing
# cross-thread FEN contamination from the previous singleton design.
import queue as _queue

_pool: _queue.Queue = _queue.Queue()
_pool_lock = threading.Lock()
_pool_initialized = False

def _init_pool():
    global _pool_initialized
    with _pool_lock:
        if _pool_initialized:
            return
        for _ in range(POOL_SIZE):
            try:
                sf = Stockfish(path=STOCKFISH_PATH or "stockfish")
                _pool.put(sf)
            except Exception as e:
                logging.error(f"Stockfish pool init failed: {e}")
        _pool_initialized = True

class _EngineCtx:
    """Context manager: acquires an engine from the pool, returns it on exit."""
    def __init__(self, depth: int):
        self.depth = depth
        self._sf: Stockfish | None = None

    def __enter__(self) -> Stockfish | None:
        _init_pool()
        try:
            self._sf = _pool.get(timeout=10)
            self._sf.set_depth(self.depth)
            return self._sf
        except _queue.Empty:
            logging.error("Stockfish pool exhausted — no instance available within 10s")
            return None
        except Exception as e:
            logging.error(f"Stockfish set_depth failed: {e}")
            if self._sf is not None:
                _pool.put(self._sf)
                self._sf = None
            return None

    def __exit__(self, *_):
        if self._sf is not None:
            _pool.put(self._sf)

def get_engine(depth: int = 15) -> "_EngineCtx":
    """Usage: `with get_engine(18) as sf:` — sf may be None if pool is exhausted."""
    return _EngineCtx(depth)

# Legacy shim so existing callers still work (used only in single-threaded paths)
def get_stockfish_instance(depth: int = 15) -> Stockfish | None:
    _init_pool()
    try:
        sf = _pool.get(timeout=5)
        sf.set_depth(depth)
        return sf
    except Exception as e:
        logging.error(f"get_stockfish_instance failed: {e}")
        return None

def release_stockfish_instance(sf: Stockfish | None):
    if sf is not None:
        _pool.put(sf)

def win_percent(cp: float) -> float:
    """
    Convert a centipawn evaluation (from the mover's perspective) to a win
    probability in [0, 100], using the same logistic mapping chess.com / Lichess
    use for their accuracy model.
    """
    return 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * cp)) - 1.0)


def move_accuracy(win_before: float, win_after: float) -> float:
    """
    Per-move accuracy (0..100) from the drop in win% caused by the move.
    A move that keeps your win% flat scores ~100; a move that tanks it scores low.
    This is the chess.com/Lichess per-move accuracy formula.
    """
    drop = max(0.0, win_before - win_after)
    acc = 103.1668 * math.exp(-0.04354 * drop) - 3.1669
    return max(0.0, min(100.0, acc))


def analyze_move_cp(sf, board_fen, move_played_san, player_color):
    """
    Evaluates a specific move against the engine's best move.
    sf: Stockfish instance
    board_fen: FEN *before* the move is played
    move_played_san: The move played by human in SAN or UCI
    player_color: chess.WHITE or chess.BLACK
    """
    sf.set_fen_position(board_fen)

    # E4: removed sf.get_best_move() — redundant, top_moves[0] has the same info
    top_moves = sf.get_top_moves(2)
    best_move_uci = top_moves[0]["Move"] if top_moves else None

    # E5: normalize eval_before to current player's perspective
    eval_before_raw = sf.get_evaluation()
    eval_before_cp_raw = eval_before_raw["value"] if eval_before_raw["type"] == "cp" else (
        10000 if eval_before_raw["value"] > 0 else -10000
    )
    # Stockfish reports from side-to-move perspective; normalize to the playing player
    eval_before_normalized = eval_before_cp_raw if player_color == chess.WHITE else -eval_before_cp_raw

    eval_best_cp = top_moves[0]["Centipawn"] if top_moves and top_moves[0]["Centipawn"] is not None else 0
    if top_moves and top_moves[0]["Centipawn"] is not None:
        eval_best_cp = eval_best_cp if player_color == chess.WHITE else -eval_best_cp

    # Eval after user move
    b = chess.Board(board_fen)
    try:
        user_move = b.parse_uci(move_played_san) if len(move_played_san) in (4, 5) else b.parse_san(move_played_san)
    except Exception:
        return 0, "Mistake", eval_before_normalized, 0, 0, None, None, 0.0

    b.push(user_move)
    sf.set_fen_position(b.fen())
    eval_after_dict = sf.get_evaluation()
    # get_evaluation is from the side-to-move's perspective (the opponent, after our
    # move), so we flip it to the mover's perspective.
    if eval_after_dict["type"] == "mate":
        # A mate score for the opponent-to-move: value <= 0 means THEY are getting
        # mated (value 0 == they are already checkmated) -> a win for us. value > 0
        # means they mate us. (Fixes checkmate-delivering moves being scored as blunders.)
        eval_after_cp = 10000 if eval_after_dict["value"] <= 0 else -10000
    else:
        eval_after_cp = -eval_after_dict["value"]

    raw_delta = eval_best_cp - eval_after_cp  # negative means player beat engine's choice
    cp_loss = max(0, raw_delta)

    # Per-move accuracy from the win% drop (chess.com model): win% of the position
    # if best move is played vs win% after the move actually played.
    win_before = win_percent(eval_best_cp)
    win_after = win_percent(eval_after_cp)
    acc = move_accuracy(win_before, win_after)

    # E3: Brilliant — played move is strictly better than engine's top choice
    if raw_delta < -30:
        classification = "Brilliant"
    elif cp_loss < 10 and user_move.uci() == best_move_uci:
        classification = "Great move"
    elif cp_loss < 10:
        classification = "Best"
    elif cp_loss <= 25:
        classification = "Excellent"
    elif cp_loss <= 50:
        classification = "Good"
    elif cp_loss <= 100:
        classification = "Inaccuracy"
    elif cp_loss <= 200:
        classification = "Mistake"
    else:
        # Miss vs Blunder: a "Miss" is failing to convert a clearly winning/equal
        # position (a big opportunity thrown away) rather than a losing move played
        # from an already-bad spot. chess.com draws this distinction; approximate it.
        if eval_best_cp >= 150 and eval_after_cp < eval_best_cp - 150:
            classification = "Miss"
        else:
            classification = "Blunder"

    return cp_loss, classification, eval_before_normalized, eval_after_cp, eval_best_cp, best_move_uci, user_move.uci(), round(acc, 1)

def compute_game_accuracy(cp_losses):
    if not cp_losses:
        return 100.0
    avg_loss = sum(cp_losses) / len(cp_losses)
    raw_accuracy = 103.1668 * math.exp(-0.04354 * avg_loss) - 3.1669
    return round(max(0.0, min(100.0, raw_accuracy)), 1)
