import asyncio
import os
import chess
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from engine import get_engine, get_stockfish_instance, release_stockfish_instance, analyze_move_cp, compute_game_accuracy

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

    import io
    import chess.pgn
    pgn_io = io.StringIO(pgn)
    game = chess.pgn.read_game(pgn_io)
    
    if not game:
        return
        
    board = game.board()
    
    white_cp_losses = []
    black_cp_losses = []
    white_classifications = []
    black_classifications = []
    critical_moments = []
    
    move_number = 1
    for move in game.mainline_moves():
        player_color = board.turn
        current_fen = board.fen()
        
        cp_loss, classification, eb, ea, ebest, best_uci, played_uci = analyze_move_cp(
            sf, current_fen, move.uci(), player_color
        )
        
        move_entry = {
            "move": played_uci,
            "classification": classification,
            "cp_loss": cp_loss,
            "eval_before": eb,
            "eval_after": ea,
        }
        
        if player_color == chess.WHITE:
            white_cp_losses.append(cp_loss)
            white_classifications.append(move_entry)
        else:
            black_cp_losses.append(cp_loss)
            black_classifications.append(move_entry)
            
        if classification in ["Blunder", "Mistake", "Brilliant", "Great move"]:
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
        if player_color == chess.BLACK:
            move_number += 1
            
    white_acc = compute_game_accuracy(white_cp_losses)
    black_acc = compute_game_accuracy(black_cp_losses)
    
    if supabase:
        try:
            supabase.table('games').update({
                'white_accuracy': white_acc,
                'black_accuracy': black_acc,
                'white_move_classifications': white_classifications,
                'black_move_classifications': black_classifications,
                'critical_moments': critical_moments
            }).eq('id', game_id).execute()
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
        cp_loss, classification, eb, ea, ebest, best_uci, played_uci = analyze_move_cp(
            sf, req.fen, req.move, board.turn
        )
        return {"classification": classification, "cp_loss": cp_loss, "best_move": best_uci}
