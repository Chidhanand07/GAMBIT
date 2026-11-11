"""Engine analysis endpoints: POST /analyse-game, /analyze, /classify-move."""

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from seams import EngineSeams
from services import analysis as analysis_service

CLASSIFY_DEPTH = 14


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


def build_router(seams: EngineSeams) -> APIRouter:
    router = APIRouter()

    @router.post("/analyse-game")
    def analyse_game(req: GameAnalysisReq, bg_tasks: BackgroundTasks):
        # Quick check engine is available without holding a pool slot
        sf_check = seams.get_stockfish_instance(1)
        if not sf_check:
            raise HTTPException(status_code=503, detail="Engine unavailable")
        seams.release_stockfish_instance(sf_check)

        bg_tasks.add_task(seams.run_full_game_analysis, req.game_id, req.pgn)
        return {"status": "Analysis queued"}

    @router.post("/analyze")
    def analyze_position(req: AnalyzeReq):
        """Single-position analysis used by the Analysis page via the Node proxy."""
        with seams.get_engine(req.depth) as sf:
            if not sf:
                raise HTTPException(status_code=503, detail="Engine unavailable")
            try:
                return analysis_service.analyse_position(sf, req.fen)
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e)) from e

    @router.post("/classify-move")
    def classify_move(req: MoveClassifyReq):
        with seams.get_engine(CLASSIFY_DEPTH) as sf:
            if not sf:
                raise HTTPException(status_code=503, detail="Engine unavailable")
            return analysis_service.classify_move(sf, req.fen, req.move)

    return router
