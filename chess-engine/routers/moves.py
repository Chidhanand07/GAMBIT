"""Move legality endpoints: POST /validate-move, POST /valid-moves."""

import chess
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class MoveReq(BaseModel):
    fen: str
    move: str


@router.post("/validate-move")
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
                    "is_game_over": b.is_game_over(),
                },
            }
        return {"valid": False}
    except Exception as e:
        return {"valid": False, "error": str(e)}


@router.post("/valid-moves")
def valid_moves(req: MoveReq):
    try:
        b = chess.Board(req.fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {e}") from e
    return {"valid_moves": [m.uci() for m in b.legal_moves]}
