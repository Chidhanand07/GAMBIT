"""MAVERICK endpoints: GET /style-move/health, POST /style-move, POST /computer-move."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from computer_engine import get_computer_move
from routers.fen import parse_fen
from style_engine import get_style_move, style_model_loaded

router = APIRouter()


class StyleMoveReq(BaseModel):
    fen: str
    top_k: int = 3


class ComputerMoveReq(BaseModel):
    fen: str
    difficulty: str = "medium"


@router.get("/style-move/health")
def style_move_health():
    return {"model_loaded": style_model_loaded()}


@router.post("/style-move")
def style_move(req: StyleMoveReq):
    parse_fen(req.fen)
    result = get_style_move(req.fen, top_k=req.top_k)
    if result is None:
        raise HTTPException(status_code=422, detail="Style model not loaded or no legal moves in position.")
    return result


@router.post("/computer-move")
def computer_move(req: ComputerMoveReq):
    """MAVERICK's move for a computer game — style bot supervised by Stockfish per difficulty."""
    parse_fen(req.fen)
    result = get_computer_move(req.fen, req.difficulty)
    if result is None:
        raise HTTPException(status_code=422, detail="No move available (game over or no legal moves).")
    return result
