"""GET /health: the engine's only public endpoint (platform health checks)."""

from fastapi import APIRouter

from seams import EngineSeams


def build_router(seams: EngineSeams) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health():
        # Never takes a pool instance: taking one without releasing it emptied the pool
        # (G18), and waiting for one let a busy pool block the platform's health checks
        # (RATE-LIMITS). "online" means at least one Stockfish started.
        return {"status": "ok", "engine": seams.engine_status()}

    return router
