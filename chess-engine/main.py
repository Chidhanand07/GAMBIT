import asyncio
import os
import chess
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from engine import get_engine, get_stockfish_instance, release_stockfish_instance, analyze_move_cp, compute_game_accuracy
from style_engine import get_style_move, style_model_loaded
from computer_engine import get_computer_move

# Setup Supabase client
from supabase import create_client, Client
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Gambit Engine")

class MoveReq(BaseModel):
    fen: str
    move: str

class GameAnalysisReq(BaseModel):
    game_id: str
    pgn: str
    time_control: str

class MoveClassifyReq(BaseModel):
    fen: str
    move: str

class AnalyzeReq(BaseModel):
    fen: str
    depth: int = 18

@app.get("/health")
def health():
    sf = get_stockfish_instance(depth=1)
    status = "Engine unavailable" if not sf else "online"
    return {"status": "ok", "engine": status}

@app.post("/validate-move")
def validate_move(req: MoveReq):
    try:
        b = chess.Board(req.fen)
        move = chess.Move.from_uci(req.move)
        if move in b.legal_moves:
            b.push(move)
            return {
                "valid": True,
                "new_fen": b.fen(),
                "flags": {
                    "is_check": b.is_check(),
                    "is_checkmate": b.is_checkmate(),
                    "is_stalemate": b.is_stalemate(),
                    "is_game_over": b.is_game_over()
                }
            }
        return {"valid": False}
    except Exception as e:
        return {"valid": False, "error": str(e)}

@app.post("/valid-moves")
def valid_moves(req: MoveReq):
    try:
        b = chess.Board(req.fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {e}")
    return {"valid_moves": [m.uci() for m in b.legal_moves]}

def run_full_game_analysis(game_id: str, pgn: str):
    sf = get_stockfish_instance(depth=18)
    if not sf:
        print(f"Skipping analysis for {game_id}, engine unavailable")
        return
    # Note: sf is already acquired from pool; release in finally below

    try:
        import io
        import chess.pgn
        pgn_io = io.StringIO(pgn)
        game = chess.pgn.read_game(pgn_io)
    
        if not game:
            return
        
        board = game.board()
    
        white_accuracies = []
        black_accuracies = []
        white_classifications = []
        black_classifications = []
        critical_moments = []
        eval_graph = []   # white-perspective centipawns per ply, for the advantage chart

        move_number = 1
        ply = 0
        for move in game.mainline_moves():
            player_color = board.turn
            current_fen = board.fen()

            cp_loss, classification, eb, ea, ebest, best_uci, played_uci, move_acc = analyze_move_cp(
                sf, current_fen, move.uci(), player_color
            )

            # Book: early, sound moves are opening theory rather than "found" moves.
            # Heuristic (no polyglot book on the server): first 8 plies with low loss.
            if ply < 8 and classification in ("Best", "Excellent", "Good") and cp_loss <= 40:
                classification = "Book"

            # White-perspective eval after this move, for the eval graph.
            eval_white = ea if player_color == chess.WHITE else -ea
            eval_graph.append(eval_white)

            move_entry = {
                "move_number": move_number,
                "ply": ply,
                "move": played_uci,
                "san": board.san(move),
                "classification": classification,
                "cp_loss": cp_loss,
                "accuracy": move_acc,
                "best_move": best_uci,
                "eval_before": eb,
                "eval_after": ea,
                "eval_white": eval_white,
            }

            if player_color == chess.WHITE:
                white_accuracies.append(move_acc)
                white_classifications.append(move_entry)
            else:
                black_accuracies.append(move_acc)
                black_classifications.append(move_entry)

            if classification in ["Blunder", "Miss", "Mistake", "Brilliant", "Great move"]:
                critical_moments.append({
                    "move_number": move_number,
                    "type": classification,
                    "best_move": best_uci,
                    "played_move": played_uci,
                    "eval_before": eb,
                    "eval_after": ea,
                    "description": f"{'White' if player_color == chess.WHITE else 'Black'} played a {classification}"
                })

            board.push(move)
            ply += 1
            if player_color == chess.BLACK:
                move_number += 1

        white_acc = round(sum(white_accuracies) / len(white_accuracies), 1) if white_accuracies else 100.0
        black_acc = round(sum(black_accuracies) / len(black_accuracies), 1) if black_accuracies else 100.0
    
        if supabase:
            try:
                supabase.table('games').update({
                    'white_accuracy': white_acc,
                    'black_accuracy': black_acc,
                    'white_move_classifications': white_classifications,
                    'black_move_classifications': black_classifications,
                    'critical_moments': critical_moments,
                }).eq('id', game_id).execute()
                # Note: the eval graph is derived client-side from each move entry's
                # `eval_white`, so no separate `eval_graph` column is required.
            except Exception as e:
                print("Failed to save analysis to supabase:", e)
    finally:
        release_stockfish_instance(sf)

@app.post("/analyse-game")
def analyse_game(req: GameAnalysisReq, bg_tasks: BackgroundTasks):
    # Quick check engine is available without holding a pool slot
    sf_check = get_stockfish_instance(1)
    if not sf_check:
        raise HTTPException(status_code=503, detail="Engine unavailable")
    release_stockfish_instance(sf_check)
    
    bg_tasks.add_task(run_full_game_analysis, req.game_id, req.pgn)
    return {"status": "Analysis queued"}

@app.post("/analyze")
def analyze_position(req: AnalyzeReq):
    """Single-position analysis used by the Analysis page via the Node proxy."""
    with get_engine(req.depth) as sf:
        if not sf:
            raise HTTPException(status_code=503, detail="Engine unavailable")
        try:
            sf.set_fen_position(req.fen)
            evaluation = sf.get_evaluation()
            top_moves = sf.get_top_moves(3)
            lines = [{"move": m["Move"], "centipawn": m.get("Centipawn"), "mate": m.get("Mate")} for m in top_moves]
            return {
                "best_move": top_moves[0]["Move"] if top_moves else None,
                "evaluation": {"type": evaluation["type"], "value": evaluation["value"]},
                "lines": lines,
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.post("/classify-move")
def classify_move(req: MoveClassifyReq):
    with get_engine(14) as sf:
        if not sf:
            raise HTTPException(status_code=503, detail="Engine unavailable")
        board = chess.Board(req.fen)
        cp_loss, classification, eb, ea, ebest, best_uci, played_uci, move_acc = analyze_move_cp(
            sf, req.fen, req.move, board.turn
        )
        return {"classification": classification, "cp_loss": cp_loss, "best_move": best_uci}


class StyleMoveReq(BaseModel):
    fen: str
    top_k: int = 3

@app.get("/style-move/health")
def style_move_health():
    return {"model_loaded": style_model_loaded()}

@app.post("/style-move")
def style_move(req: StyleMoveReq):
    try:
        result = get_style_move(req.fen, top_k=req.top_k)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=422,
                             detail="Style model not loaded or no legal moves in position.")
    return result


class ComputerMoveReq(BaseModel):
    fen: str
    difficulty: str = "medium"

@app.post("/computer-move")
def computer_move(req: ComputerMoveReq):
    """MAVERICK's move for a computer game — style bot supervised by Stockfish per difficulty."""
    try:
        result = get_computer_move(req.fen, req.difficulty)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=422,
                             detail="No move available (game over or no legal moves).")
    return result
