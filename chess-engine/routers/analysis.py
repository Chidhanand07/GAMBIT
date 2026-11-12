"""Engine analysis endpoints: POST /analyse-game, /analyze, /classify-move."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from routers.fen import parse_fen
from seams import EngineSeams
from services import analysis as analysis_service
from services import review as review_service

CLASSIFY_DEPTH = 14

# Why a review cannot be queued -> (HTTP status, detail).
REVIEW_REFUSALS = {
    review_service.REVIEW_UNAVAILABLE: (503, "Game lookup unavailable"),
    review_service.REVIEW_GAME_NOT_FOUND: (404, "Game not found"),
    review_service.REVIEW_GAME_NOT_COMPLETED: (409, "Game is not completed"),
}


class GameAnalysisReq(BaseModel):
    game_id: UUID
    pgn: str
    time_control: str


class MoveClassifyReq(BaseModel):
    fen: str
    move: str


class AnalyzeReq(BaseModel):
    fen: str
    depth: int = 18


def build_router(seams: EngineSeams) -> APIRouter:
    router = APIRouter()

    @router.post("/analyse-game")
    def analyse_game(req: GameAnalysisReq, bg_tasks: BackgroundTasks):
        # Quick check engine is available without holding a pool slot
        sf_check = seams.get_stockfish_instance(1)
        if not sf_check:
            raise HTTPException(status_code=503, detail="Engine unavailable")
        seams.release_stockfish_instance(sf_check)

        # The review is written to the games row: only for a game that exists and is over.
        game_id = str(req.game_id)
        refusal = REVIEW_REFUSALS.get(review_service.game_review_status(seams, game_id))
        if refusal:
            raise HTTPException(status_code=refusal[0], detail=refusal[1])

        bg_tasks.add_task(seams.run_full_game_analysis, game_id, req.pgn)
        return {"status": "Analysis queued"}

    @router.post("/analyze")
    def analyze_position(req: AnalyzeReq):
        """Single-position analysis used by the Analysis page via the Node proxy."""
        parse_fen(req.fen)
        with seams.get_engine(req.depth) as sf:
            if not sf:
                raise HTTPException(status_code=503, detail="Engine unavailable")
            try:
                return analysis_service.analyse_position(sf, req.fen)
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e)) from e

    @router.post("/classify-move")
    def classify_move(req: MoveClassifyReq):
        parse_fen(req.fen)
        with seams.get_engine(CLASSIFY_DEPTH) as sf:
            if not sf:
                raise HTTPException(status_code=503, detail="Engine unavailable")
            return analysis_service.classify_move(sf, req.fen, req.move)

    return router
