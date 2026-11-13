"""GET /health: the engine's only public endpoint (platform health checks)."""

from fastapi import APIRouter

from seams import EngineSeams

HEALTH_PROBE_DEPTH = 1


def build_router(seams: EngineSeams) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health():
        # The context manager returns the instance to the pool on exit. Taking one
        # without releasing it emptied the pool after STOCKFISH_POOL_SIZE probes.
        with seams.get_engine(HEALTH_PROBE_DEPTH) as sf:
            status = "Engine unavailable" if not sf else "online"
        return {"status": "ok", "engine": status}

    return router
