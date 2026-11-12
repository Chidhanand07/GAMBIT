"""Move legality endpoints: POST /validate-move, POST /valid-moves."""

import chess
from fastapi import APIRouter
from pydantic import BaseModel

from routers.fen import parse_fen

router = APIRouter()


class MoveReq(BaseModel):
    fen: str
    move: str


@router.post("/validate-move")
def validate_move(req: MoveReq):
    b = parse_fen(req.fen)
    try:
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
    b = parse_fen(req.fen)
    return {"valid_moves": [m.uci() for m in b.legal_moves]}
