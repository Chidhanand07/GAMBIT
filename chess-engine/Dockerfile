# The one definition of the engine's runtime (ENGINE-BUILD): Python, the
# dependencies and Stockfish. Render builds this file (see /render.yaml); run it
# locally with:
#   docker build -t gambit-engine chess-engine
#   docker run --rm -p 8001:8001 --env-file chess-engine/.env gambit-engine
FROM python:3.11-slim

WORKDIR /app

# Stockfish comes from Debian and is installed here and nowhere else. Debian puts
# the binary in /usr/games, which is not on PATH, so STOCKFISH_PATH names it; the
# build fails if the binary is not there rather than shipping an engine without one.
ENV STOCKFISH_PATH=/usr/games/stockfish
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/* \
    && test -x "$STOCKFISH_PATH"

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Includes style_model.pt (the MAVERICK weights tracked in git). If it is ever
# left out, set MAVERICK_MODEL_URL + MAVERICK_MODEL_SHA256 and the engine
# downloads and verifies it at startup (services/model_store.py).
COPY . .

EXPOSE 8001

# Render assigns the port through $PORT; 8001 is the local default.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"]
