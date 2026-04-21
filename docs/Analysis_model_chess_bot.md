# Chess Analysis Model — Complete Guide (Free, From Scratch to Production)

> This guide covers every path from "I have nothing" to a working chess analysis AI integrated into your Gambit platform. All approaches are 100% free. If you want to train, you can. If you want to use a pre-trained neural net, you can. This document explains all three tiers clearly so you pick the right one for your current situation.

---

## Table of Contents

1. [Understanding What "Analysis" Actually Means in Chess](#1-understanding-what-analysis-actually-means-in-chess)
2. [The Three Tiers — Which One is Right for You](#2-the-three-tiers)
3. [Tier 1 — Stockfish (Already Running in Your App)](#3-tier-1--stockfish-already-running-in-your-app)
4. [Tier 2 — Leela Chess Zero (Free Neural Network Engine)](#4-tier-2--leela-chess-zero-neural-network-engine)
5. [Tier 3 — Train Your Own Model From Scratch](#5-tier-3--train-your-own-model-from-scratch)
   - 5a. Data Sources (Free)
   - 5b. Architecture Choices
   - 5c. Value Network (Position Evaluation)
   - 5d. Policy Network (Move Prediction)
   - 5e. Full AlphaZero-style Self-Play Training Loop
   - 5f. Training on Free Hardware
6. [Integrating Any Model into Gambit](#6-integrating-any-model-into-gambit)
   - 6a. Your Current Architecture
   - 6b. Adding Leela to chess-engine/
   - 6c. Adding Your Custom Model to chess-engine/
   - 6d. Multi-Engine API Design
   - 6e. Move Classification with Your Model
7. [Accuracy Formula — How It Works in Your Codebase](#7-accuracy-formula)
8. [Advanced: Hybrid Engine (Stockfish + Neural Net Together)](#8-advanced-hybrid-engine)
9. [Deployment Notes (Free Tiers)](#9-deployment-notes)
10. [Quick Reference — Commands Cheat Sheet](#10-quick-reference)

---

## 1. Understanding What "Analysis" Actually Means in Chess

A chess analysis system does four things:

| Task | What it computes | Difficulty |
|------|-----------------|------------|
| **Position evaluation** | How good is this position? (e.g., +1.4 pawns for white) | Medium |
| **Best move** | What's the objectively strongest move here? | Medium |
| **Move classification** | Was that a Blunder / Mistake / Good / Brilliant? | Easy (derived from eval delta) |
| **Game accuracy %** | Overall quality of a player's game | Easy (derived from cp losses) |

Your current `engine.py` already does all four — using Stockfish as the evaluation backbone. The question is whether you want to replace or augment Stockfish with a neural network.

### Key vocabulary

- **Centipawn (cp)** — unit of chess evaluation. 100 cp = 1 pawn advantage. Stockfish evaluates in centipawns.
- **Policy** — probability distribution over legal moves (which move to play).
- **Value** — scalar score for a position (-1 to +1 or in centipawns).
- **MCTS** — Monte Carlo Tree Search. Used by AlphaZero/Leela to find strong moves using a neural net as a guide.
- **UCI** — Universal Chess Interface. The protocol Stockfish and Leela both speak. Your engine pool uses it.

---

## 2. The Three Tiers

```
Tier 1: Stockfish (already integrated, ELO ~3500)
  └─ Deterministic. Hand-crafted evaluation + alpha-beta search.
  └─ Already running. Free forever. Use this as your baseline.

Tier 2: Leela Chess Zero (ELO ~3500, neural net)
  └─ Drop-in replacement. Speaks UCI. Uses MCTS + neural net (like AlphaZero).
  └─ Pre-trained weights downloadable free. No training needed.
  └─ Best choice if you want "neural net feel" without training.

Tier 3: Train Your Own (ELO varies, 0 → 2000+ depending on effort)
  └─ Full control. Learns from Lichess game data or from self-play.
  └─ Needs GPU time (free via Google Colab / Kaggle).
  └─ Best if you want to deeply understand the model or customize it.
```

**Recommendation:** Keep Stockfish for accuracy (it is genuinely the best free evaluator). Add Leela as an alternative engine option users can switch to. Train a custom model only if you have a specific goal (e.g., teaching bot, style mimic, opening tutor).

---

## 3. Tier 1 — Stockfish (Already Running in Your App)

You already have this. Here is a complete map of what's happening so you understand it fully.

### How Stockfish works internally

```
Input: FEN string (board position)
         │
         ▼
   Alpha-Beta Search (minimax with pruning)
   ├─ Looks N moves ahead (depth = 18 in your config)
   ├─ Evaluates leaf nodes with hand-crafted eval function:
   │    - Material count (queen=9, rook=5, bishop/knight=3, pawn=1)
   │    - Piece-square tables (where is each piece? is knight on rim bad?)
   │    - King safety, pawn structure, mobility, passed pawns, etc.
   └─ Returns: best move (UCI) + score in centipawns
```

### Your current flow in `engine.py`

```python
# 1. Acquire Stockfish instance from pool
sf = _pool.get(timeout=10)

# 2. Set the position
sf.set_fen_position(board_fen)

# 3. Get evaluation and top moves
eval_raw = sf.get_evaluation()      # {"type": "cp", "value": 142}
top_moves = sf.get_top_moves(3)     # [{"Move": "e2e4", "Centipawn": 142}, ...]

# 4. Classify the move played vs best move
cp_loss = max(0, eval_best - eval_after)
# Brilliant / Great / Best / Excellent / Good / Inaccuracy / Mistake / Blunder
```

### Tuning Stockfish for free

You don't need to change code — just tune these env vars:

```bash
# In your Render service environment variables:
STOCKFISH_POOL_SIZE=2           # Free tier: 2. Paid: 4+
STOCKFISH_DEPTH_ANALYSIS=20     # Game analysis (post-game). Higher = slower but stronger.
STOCKFISH_DEPTH_LIVE=12         # Live analysis page. Lower = faster response.
```

To use different depths per endpoint, modify `main.py`:

```python
# In analyze_position() — used by analysis page (live)
with get_engine(12) as sf:   # faster for interactive use

# In run_full_game_analysis() — post-game (background task)
sf = get_stockfish_instance(depth=22)  # deeper for post-game reports
```

### Improving move classification thresholds

Your current thresholds in `engine.py` at line 126:

```python
if raw_delta < -30:           classification = "Brilliant"
elif cp_loss < 10 and ...:    classification = "Great move"
elif cp_loss < 10:            classification = "Best"
elif cp_loss <= 25:           classification = "Excellent"
elif cp_loss <= 50:           classification = "Good"
elif cp_loss <= 100:          classification = "Inaccuracy"
elif cp_loss <= 200:          classification = "Mistake"
else:                         classification = "Blunder"
```

These are close to chess.com's thresholds. If you want Lichess-style (stricter):

```python
if raw_delta < -50:           classification = "Brilliant"
elif cp_loss == 0:            classification = "Best"
elif cp_loss <= 20:           classification = "Excellent"
elif cp_loss <= 50:           classification = "Good"
elif cp_loss <= 100:          classification = "Inaccuracy"
elif cp_loss <= 300:          classification = "Mistake"
else:                         classification = "Blunder"
```

---

## 4. Tier 2 — Leela Chess Zero (Neural Network Engine, Free)

Leela Chess Zero (Lc0) is an open-source reimplementation of AlphaZero. It uses a deep residual neural network guided MCTS search — no hand-crafted evaluation. It speaks **UCI** so it plugs in exactly where Stockfish does.

### Step 1 — Install Leela locally or on Render

**On Render (production):**

Add to your render.yaml or Render build command:

```bash
# Build command (add to existing apt-get line):
apt-get install -y stockfish wget && \
wget -q https://github.com/LeelaChessZero/lc0/releases/download/v0.30.0/lc0-v0.30.0-linux-cpu-openblas.zip && \
unzip lc0-v0.30.0-linux-cpu-openblas.zip -d /usr/local/bin/ && \
chmod +x /usr/local/bin/lc0 && \
pip install -r requirements.txt
```

**On Mac (dev):**

```bash
brew install lc0
# or download binary from https://github.com/LeelaChessZero/lc0/releases
```

**On Linux (dev):**

```bash
sudo apt install lc0
```

### Step 2 — Download a free network weight file

Leela needs a neural network weights file (.pb.gz or .onnx). All networks are free:

```bash
# Best free network for CPU (smaller, still strong ~3000 ELO):
wget https://training.lczero.org/get_network?sha=00af53b081e80147172e0f64c1d22e0e315d6e8f41a8d34b8571c84e9c11ea4b \
     -O leela_weights.pb.gz

# Or get the latest from: https://lczero.org/play/networks/bestnets/
# Download the one ending in "-11x128" for CPU efficiency
# "BT4" series is recommended for CPU (balanced quality/speed)
```

Put the weights file in `chess-engine/`:

```
chess-engine/
├── main.py
├── engine.py
├── leela_engine.py      ← new file
├── leela_weights.pb.gz  ← downloaded weights
└── requirements.txt
```

### Step 3 — Create `chess-engine/leela_engine.py`

```python
import subprocess
import threading
import os
import queue
import logging

LEELA_PATH = os.environ.get("LEELA_PATH", "lc0")
LEELA_WEIGHTS = os.environ.get("LEELA_WEIGHTS", "./leela_weights.pb.gz")

class LeelaEngine:
    """
    Communicates with lc0 via UCI protocol over stdin/stdout.
    Thread-safe: one instance per thread, or use LeelaPool.
    """
    def __init__(self):
        self._proc = None
        self._lock = threading.Lock()
        self._start()

    def _start(self):
        try:
            self._proc = subprocess.Popen(
                [LEELA_PATH, f"--weights={LEELA_WEIGHTS}", "--threads=1"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                bufsize=1
            )
            self._send("uci")
            self._wait_for("uciok")
            self._send("isready")
            self._wait_for("readyok")
        except FileNotFoundError:
            logging.error("lc0 binary not found. Set LEELA_PATH env var.")
            self._proc = None

    def _send(self, cmd: str):
        if self._proc and self._proc.stdin:
            self._proc.stdin.write(cmd + "\n")
            self._proc.stdin.flush()

    def _wait_for(self, keyword: str, timeout=10.0):
        import select
        lines = []
        while True:
            line = self._proc.stdout.readline().strip()
            lines.append(line)
            if keyword in line:
                return lines

    def analyze(self, fen: str, nodes: int = 800) -> dict:
        """
        Returns {"best_move": "e2e4", "score": 0.42, "pv": "e2e4 e7e5 ..."}
        score is in pawns from white's perspective (-inf to +inf).
        nodes=800 ≈ depth 15 equivalent. nodes=3200 for deeper analysis.
        """
        if not self._proc:
            return {"best_move": None, "score": 0.0, "pv": ""}

        with self._lock:
            self._send("ucinewgame")
            self._send(f"position fen {fen}")
            self._send(f"go nodes {nodes}")

            best_move = None
            score = 0.0
            pv = ""

            while True:
                line = self._proc.stdout.readline().strip()
                if line.startswith("info"):
                    # Parse score: "info depth 10 score cp 142 pv e2e4 ..."
                    parts = line.split()
                    if "score" in parts:
                        si = parts.index("score")
                        if parts[si+1] == "cp":
                            score = int(parts[si+2]) / 100.0
                        elif parts[si+1] == "mate":
                            mate_in = int(parts[si+2])
                            score = 100.0 if mate_in > 0 else -100.0
                    if "pv" in parts:
                        pvi = parts.index("pv")
                        pv = " ".join(parts[pvi+1:pvi+9])
                elif line.startswith("bestmove"):
                    best_move = line.split()[1]
                    break

            return {"best_move": best_move, "score": score, "pv": pv}

    def quit(self):
        if self._proc:
            self._send("quit")
            self._proc.wait(timeout=5)


class LeelaPool:
    """Thread-safe pool of Leela instances (same pattern as Stockfish pool)."""
    def __init__(self, size: int = 2):
        self._q: queue.Queue = queue.Queue()
        for _ in range(size):
            try:
                self._q.put(LeelaEngine())
            except Exception as e:
                logging.error(f"Leela init failed: {e}")

    def get(self, timeout=15) -> "LeelaEngine | None":
        try:
            return self._q.get(timeout=timeout)
        except queue.Empty:
            return None

    def put(self, engine: "LeelaEngine"):
        self._q.put(engine)


# Module-level pool — initialized lazily
_leela_pool: LeelaPool | None = None
_leela_lock = threading.Lock()

def get_leela_pool() -> LeelaPool:
    global _leela_pool
    if _leela_pool is None:
        with _leela_lock:
            if _leela_pool is None:
                size = int(os.environ.get("LEELA_POOL_SIZE", "1"))
                _leela_pool = LeelaPool(size)
    return _leela_pool
```

### Step 4 — Add Leela endpoint to `main.py`

```python
from leela_engine import get_leela_pool

class LeelaReq(BaseModel):
    fen: str
    nodes: int = 800   # higher = stronger, slower

@app.post("/analyze/leela")
def analyze_leela(req: LeelaReq):
    pool = get_leela_pool()
    engine = pool.get(timeout=15)
    if not engine:
        raise HTTPException(status_code=503, detail="Leela unavailable")
    try:
        result = engine.analyze(req.fen, nodes=req.nodes)
        return {
            "best_move": result["best_move"],
            "score": result["score"],      # pawns, white-positive
            "pv": result["pv"],
            "engine": "lc0"
        }
    finally:
        pool.put(engine)
```

### Step 5 — Call from Node server or directly from frontend

Add to your Node `server/server.js`:

```js
app.post('/api/analysis/engine/leela', async (req, res) => {
    try {
        const { fen, nodes = 800 } = req.body;
        const engineUrl = process.env.GAMBIT_ENGINE_URL || 'http://localhost:8000';
        const response = await fetch(`${engineUrl}/analyze/leela`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, nodes }),
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(503).json({ error: 'Leela unavailable', detail: err.message });
    }
});
```

Then in the analysis page, add an engine toggle:

```tsx
// In AnalysisPage state:
const [engineMode, setEngineMode] = useState<'stockfish' | 'leela'>('stockfish');

// In the fetch call:
const endpoint = engineMode === 'leela'
    ? '/api/analysis/engine/leela'
    : '/api/analysis/engine';
```

---

## 5. Tier 3 — Train Your Own Model From Scratch

This is the deep path. You will build a neural network that can evaluate chess positions and suggest moves. It won't match Stockfish's ELO but it will be *yours*, fully understood, and extendable.

### 5a. Data Sources (All Free)

#### Option A: Lichess Open Database (Recommended)
Lichess publishes every game ever played on their platform. Free download.

```
URL: https://database.lichess.org/
Format: .pgn.zst (compressed PGN)
Size: ~20GB per month compressed, ~100GB uncompressed
Contains: ~100 million games per year
```

Download a month of data:

```bash
# Install decompressor
pip install zstandard

# Download one month (January 2024 — ~4GB compressed)
wget https://database.lichess.org/standard/lichess_db_standard_rated_2024-01.pgn.zst

# Decompress
python3 -c "
import zstandard as zstd
with open('lichess_db_standard_rated_2024-01.pgn.zst', 'rb') as f_in:
    with open('lichess_jan2024.pgn', 'wb') as f_out:
        ctx = zstd.ZstdDecompressor()
        ctx.copy_stream(f_in, f_out)
"
```

#### Option B: Use Stockfish to Self-Label Data
Generate positions and have Stockfish evaluate them. This is how many training datasets are built.

```python
# generate_training_data.py
import chess
import chess.pgn
import random
from stockfish import Stockfish

sf = Stockfish(depth=15)
positions = []

def random_position(max_moves=40):
    """Play random legal moves to get a diverse position."""
    board = chess.Board()
    num_moves = random.randint(5, max_moves)
    for _ in range(num_moves):
        if board.is_game_over():
            break
        move = random.choice(list(board.legal_moves))
        board.push(move)
    return board.fen()

# Generate 100k positions with Stockfish evaluations
for i in range(100_000):
    fen = random_position()
    sf.set_fen_position(fen)
    eval_result = sf.get_evaluation()
    if eval_result["type"] == "cp":
        score = max(-1000, min(1000, eval_result["value"])) / 1000.0  # normalize to [-1, 1]
        positions.append({"fen": fen, "score": score})

# Save as JSON Lines
import json
with open("training_data.jsonl", "w") as f:
    for p in positions:
        f.write(json.dumps(p) + "\n")
```

#### Option C: Parse Real Games from Lichess PGN

```python
# parse_lichess_pgn.py
import chess.pgn
import io

def extract_positions_from_pgn(pgn_path: str, max_games: int = 10_000):
    """
    Extract (FEN, result) pairs from real games.
    result: 1.0 = white wins, 0.0 = black wins, 0.5 = draw
    """
    data = []
    with open(pgn_path, "r", errors="replace") as f:
        for _ in range(max_games):
            game = chess.pgn.read_game(f)
            if not game:
                break

            result_str = game.headers.get("Result", "*")
            if result_str == "1-0":
                result = 1.0
            elif result_str == "0-1":
                result = 0.0
            elif result_str == "1/2-1/2":
                result = 0.5
            else:
                continue  # skip unfinished games

            board = game.board()
            for move in game.mainline_moves():
                fen = board.fen()
                data.append({"fen": fen, "result": result})
                board.push(move)

    return data
```

### 5b. Architecture Choices

There are three practical architectures for a chess evaluation model:

#### Architecture 1: Simple CNN (easiest, weakest)

```
Input: 8×8×12 tensor (one plane per piece type per color)
  ↓
Conv2D(64 filters, 3×3) → ReLU
Conv2D(128 filters, 3×3) → ReLU
Conv2D(256 filters, 3×3) → ReLU
  ↓
Flatten → Dense(512) → Dense(256) → Dense(1, tanh)
Output: [-1, +1] (−1=black winning, +1=white winning)
```

#### Architecture 2: ResNet (medium, AlphaZero-style)

```
Input: 8×8×18 tensor (piece planes + side to move + castling + en passant)
  ↓
Conv2D(256, 3×3) + BatchNorm + ReLU   [Initial block]
  ↓
[× 10 Residual blocks]:
  Conv2D(256, 3×3) + BN + ReLU
  Conv2D(256, 3×3) + BN
  + skip connection → ReLU
  ↓
Value head:
  Conv2D(1, 1×1) + BN + ReLU → Flatten → Dense(256) → Dense(1, tanh)

Policy head (optional):
  Conv2D(2, 1×1) + BN + ReLU → Flatten → Dense(1858)  [all possible moves]
```

#### Architecture 3: Transformer (experimental, modern)

Treats the 64 squares as a sequence of 64 tokens. Each token is a piece embedding. Works well but needs more data and compute.

**Recommended for training from scratch: ResNet (Architecture 2).**

### 5c. Value Network — Full Implementation

```python
# model/chess_value_net.py
import torch
import torch.nn as nn
import numpy as np
import chess

# ─── Board Encoding ────────────────────────────────────────────────────────

PIECE_TO_PLANE = {
    (chess.PAWN,   chess.WHITE): 0,
    (chess.KNIGHT, chess.WHITE): 1,
    (chess.BISHOP, chess.WHITE): 2,
    (chess.ROOK,   chess.WHITE): 3,
    (chess.QUEEN,  chess.WHITE): 4,
    (chess.KING,   chess.WHITE): 5,
    (chess.PAWN,   chess.BLACK): 6,
    (chess.KNIGHT, chess.BLACK): 7,
    (chess.BISHOP, chess.BLACK): 8,
    (chess.ROOK,   chess.BLACK): 9,
    (chess.QUEEN,  chess.BLACK): 10,
    (chess.KING,   chess.BLACK): 11,
}

def board_to_tensor(board: chess.Board) -> torch.Tensor:
    """
    Encode a chess.Board into an 18-channel 8×8 tensor.
    Channels 0-11: piece planes (one per piece type × color)
    Channel 12: side to move (all 1s if white to move)
    Channels 13-16: castling rights (KQkq)
    Channel 17: en passant square
    """
    planes = np.zeros((18, 8, 8), dtype=np.float32)

    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece:
            rank, file = chess.square_rank(square), chess.square_file(square)
            plane_idx = PIECE_TO_PLANE[(piece.piece_type, piece.color)]
            planes[plane_idx][rank][file] = 1.0

    if board.turn == chess.WHITE:
        planes[12] = 1.0

    if board.has_kingside_castling_rights(chess.WHITE):  planes[13] = 1.0
    if board.has_queenside_castling_rights(chess.WHITE): planes[14] = 1.0
    if board.has_kingside_castling_rights(chess.BLACK):  planes[15] = 1.0
    if board.has_queenside_castling_rights(chess.BLACK): planes[16] = 1.0

    if board.ep_square is not None:
        rank, file = chess.square_rank(board.ep_square), chess.square_file(board.ep_square)
        planes[17][rank][file] = 1.0

    return torch.tensor(planes)

def fen_to_tensor(fen: str) -> torch.Tensor:
    return board_to_tensor(chess.Board(fen))


# ─── Residual Block ─────────────────────────────────────────────────────────

class ResBlock(nn.Module):
    def __init__(self, channels: int = 256):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1   = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2   = nn.BatchNorm2d(channels)
        self.relu  = nn.ReLU(inplace=True)

    def forward(self, x):
        residual = x
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.bn2(self.conv2(x))
        return self.relu(x + residual)


# ─── Full Model ─────────────────────────────────────────────────────────────

class ChessNet(nn.Module):
    """
    AlphaZero-style chess evaluation network.
    Input:  (batch, 18, 8, 8) tensor
    Output: (batch, 1) value in [-1, +1]
            white positive, black negative.
    """
    def __init__(self, num_res_blocks: int = 10, channels: int = 256):
        super().__init__()

        # Initial convolution
        self.initial = nn.Sequential(
            nn.Conv2d(18, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(inplace=True),
        )

        # Residual tower
        self.res_blocks = nn.Sequential(
            *[ResBlock(channels) for _ in range(num_res_blocks)]
        )

        # Value head
        self.value_head = nn.Sequential(
            nn.Conv2d(channels, 1, 1, bias=False),
            nn.BatchNorm2d(1),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(64, 256),
            nn.ReLU(inplace=True),
            nn.Linear(256, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.initial(x)
        x = self.res_blocks(x)
        return self.value_head(x)

    def evaluate_fen(self, fen: str, device="cpu") -> float:
        """Convenience: returns value in [-1, +1] for a single FEN."""
        tensor = fen_to_tensor(fen).unsqueeze(0).to(device)
        with torch.no_grad():
            return self.forward(tensor).item()

    def evaluate_to_centipawns(self, fen: str, device="cpu") -> float:
        """Converts [-1,+1] to approximate centipawns (–1000 to +1000)."""
        val = self.evaluate_fen(fen, device)
        # Map tanh output to centipawns
        # val=0 → 0cp, val=1 → +∞ (clamp to 1000), val=-1 → -∞ (clamp to -1000)
        import math
        if abs(val) >= 0.9999:
            return 1000.0 * (1 if val > 0 else -1)
        return round(math.atanh(val) * 200, 1)  # rough mapping


# ─── Quick test ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    model = ChessNet(num_res_blocks=10, channels=256)
    num_params = sum(p.numel() for p in model.parameters())
    print(f"Model has {num_params:,} parameters")
    # Starting position should be near 0
    score = model.evaluate_to_centipawns("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    print(f"Starting position score (untrained): {score} cp")
```

### 5d. Policy Network (Move Prediction)

The policy head outputs a probability over all possible moves. In chess there are at most 1858 possible UCI moves. We map each move to an index.

```python
# model/policy_head.py
import chess
import numpy as np
import torch
import torch.nn as nn

# Build a universal UCI move → index mapping
def build_move_index():
    """All possible UCI moves from any square to any square (+ promotions)."""
    moves = []
    for from_sq in chess.SQUARES:
        for to_sq in chess.SQUARES:
            if from_sq == to_sq:
                continue
            moves.append(chess.Move(from_sq, to_sq).uci())
            # Promotions
            for promo in [chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT]:
                moves.append(chess.Move(from_sq, to_sq, promotion=promo).uci())
    move_to_idx = {m: i for i, m in enumerate(moves)}
    return moves, move_to_idx

ALL_MOVES, MOVE_TO_IDX = build_move_index()
NUM_MOVES = len(ALL_MOVES)  # ~4032


class ChessNetWithPolicy(nn.Module):
    """Adds a policy head to ChessNet."""
    def __init__(self, num_res_blocks=10, channels=256):
        super().__init__()
        # (Re-use ChessNet's initial + res_blocks structure)
        from chess_value_net import ResBlock
        self.initial = nn.Sequential(
            nn.Conv2d(18, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels), nn.ReLU(inplace=True))
        self.res_blocks = nn.Sequential(*[ResBlock(channels) for _ in range(num_res_blocks)])

        # Value head (same as before)
        self.value_head = nn.Sequential(
            nn.Conv2d(channels, 1, 1, bias=False), nn.BatchNorm2d(1), nn.ReLU(inplace=True),
            nn.Flatten(), nn.Linear(64, 256), nn.ReLU(inplace=True), nn.Linear(256, 1), nn.Tanh())

        # Policy head
        self.policy_head = nn.Sequential(
            nn.Conv2d(channels, 2, 1, bias=False), nn.BatchNorm2d(2), nn.ReLU(inplace=True),
            nn.Flatten(), nn.Linear(128, NUM_MOVES))  # logits, not softmax

    def forward(self, x):
        x = self.initial(x)
        x = self.res_blocks(x)
        value = self.value_head(x)
        policy = self.policy_head(x)
        return value, policy

    def get_move_probs(self, board: chess.Board, device="cpu") -> dict[str, float]:
        """Returns {uci_move: probability} for all legal moves."""
        from chess_value_net import board_to_tensor
        tensor = board_to_tensor(board).unsqueeze(0).to(device)
        with torch.no_grad():
            _, policy_logits = self.forward(tensor)

        legal_moves = [m.uci() for m in board.legal_moves]
        legal_indices = [MOVE_TO_IDX[m] for m in legal_moves if m in MOVE_TO_IDX]
        legal_logits = policy_logits[0, legal_indices]
        probs = torch.softmax(legal_logits, dim=0).tolist()
        return dict(zip(legal_moves, probs))
```

### 5e. Training Pipeline

```python
# train/train_value_net.py
"""
Full training pipeline for ChessNet value network.
Trains on Stockfish-labeled FEN positions.
Run on Google Colab (free GPU) for best results.
"""

import json
import random
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import sys
sys.path.append("../model")
from chess_value_net import ChessNet, fen_to_tensor


# ─── Dataset ────────────────────────────────────────────────────────────────

class ChessDataset(Dataset):
    """
    Expects a .jsonl file with lines like:
    {"fen": "rnbqkbnr/...", "score": 0.142}
    score is in [-1, +1] (normalize centipawns: cp / 1000, clamp to [-1, 1])
    """
    def __init__(self, path: str, max_samples: int = None):
        self.data = []
        with open(path) as f:
            for i, line in enumerate(f):
                if max_samples and i >= max_samples:
                    break
                item = json.loads(line)
                self.data.append(item)
        random.shuffle(self.data)

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        tensor = fen_to_tensor(item["fen"])
        score = torch.tensor([item["score"]], dtype=torch.float32)
        return tensor, score


# ─── Training loop ──────────────────────────────────────────────────────────

def train(
    data_path: str,
    epochs: int = 20,
    batch_size: int = 512,
    lr: float = 0.001,
    num_res_blocks: int = 10,
    channels: int = 256,
    save_path: str = "chess_model.pt",
    device: str = "cuda" if torch.cuda.is_available() else "cpu",
):
    print(f"Training on: {device}")

    dataset = ChessDataset(data_path)
    split = int(0.9 * len(dataset))
    train_ds, val_ds = torch.utils.data.random_split(dataset, [split, len(dataset) - split])
    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True,  num_workers=4)
    val_dl   = DataLoader(val_ds,   batch_size=batch_size, shuffle=False, num_workers=4)

    model = ChessNet(num_res_blocks=num_res_blocks, channels=channels).to(device)
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    loss_fn = nn.MSELoss()

    best_val_loss = float("inf")

    for epoch in range(1, epochs + 1):
        # Train
        model.train()
        train_loss = 0.0
        for tensors, scores in train_dl:
            tensors, scores = tensors.to(device), scores.to(device)
            optimizer.zero_grad()
            preds = model(tensors)
            loss = loss_fn(preds, scores)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item() * len(tensors)

        train_loss /= len(train_ds)

        # Validate
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for tensors, scores in val_dl:
                tensors, scores = tensors.to(device), scores.to(device)
                preds = model(tensors)
                val_loss += loss_fn(preds, scores).item() * len(tensors)
        val_loss /= len(val_ds)

        scheduler.step()
        print(f"Epoch {epoch:3d} | Train Loss: {train_loss:.5f} | Val Loss: {val_loss:.5f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save({
                "epoch": epoch,
                "model_state": model.state_dict(),
                "val_loss": val_loss,
                "config": {"num_res_blocks": num_res_blocks, "channels": channels}
            }, save_path)
            print(f"  ✓ Saved best model at epoch {epoch}")

    print(f"\nTraining complete. Best val loss: {best_val_loss:.5f}")
    return model


if __name__ == "__main__":
    train(
        data_path="training_data.jsonl",
        epochs=30,
        batch_size=512,
        save_path="chess_model.pt",
    )
```

### Google Colab Training (Free GPU)

Create a new Colab notebook and run:

```python
# Cell 1: Install dependencies
!pip install chess torch torchvision

# Cell 2: Upload your training_data.jsonl
from google.colab import files
uploaded = files.upload()  # upload training_data.jsonl

# Cell 3: Clone your repo or paste the model code
# (paste chess_value_net.py content here)

# Cell 4: Train
# Runtime → Change runtime type → T4 GPU (free)
train(
    data_path="training_data.jsonl",
    epochs=30,
    batch_size=1024,   # larger batch on GPU
    device="cuda",
    save_path="chess_model.pt"
)

# Cell 5: Download the trained model
files.download("chess_model.pt")
```

**Kaggle alternative:** Kaggle gives 30 hrs/week of free GPU (P100). Same process — upload data, train, download weights.

### 5f. Self-Play Reinforcement Learning (AlphaZero approach)

If you want the model to improve without any Stockfish data:

```python
# selfplay/mcts.py
import math
import chess
import torch
import random
from collections import defaultdict

C_PUCT = 1.5  # exploration constant

class MCTSNode:
    def __init__(self, board: chess.Board, parent=None, prior=0.0):
        self.board = board
        self.parent = parent
        self.prior = prior
        self.visits = 0
        self.value_sum = 0.0
        self.children: dict[str, MCTSNode] = {}

    @property
    def q_value(self):
        return self.value_sum / self.visits if self.visits > 0 else 0.0

    def ucb_score(self, parent_visits: int):
        return self.q_value + C_PUCT * self.prior * math.sqrt(parent_visits) / (1 + self.visits)


def mcts_search(board: chess.Board, model, num_simulations=200, device="cpu"):
    """
    Run MCTS from the current board state.
    Returns the best move as UCI string.
    """
    from chess_value_net import board_to_tensor

    root = MCTSNode(board.copy())

    def expand_and_eval(node: MCTSNode):
        """Expand node using neural net for value + prior."""
        if node.board.is_game_over():
            result = node.board.result()
            if result == "1-0":   return 1.0
            if result == "0-1":   return -1.0
            return 0.0

        tensor = board_to_tensor(node.board).unsqueeze(0).to(device)
        with torch.no_grad():
            # If using ChessNetWithPolicy:
            value, policy_logits = model(tensor)
            value = value.item()
            probs = torch.softmax(policy_logits[0], dim=0)

        legal_moves = list(node.board.legal_moves)
        for move in legal_moves:
            child_board = node.board.copy()
            child_board.push(move)
            from policy_head import MOVE_TO_IDX
            idx = MOVE_TO_IDX.get(move.uci(), 0)
            prior = probs[idx].item()
            node.children[move.uci()] = MCTSNode(child_board, parent=node, prior=prior)

        return value

    def backup(node: MCTSNode, value: float):
        while node is not None:
            node.visits += 1
            node.value_sum += value
            value = -value  # flip perspective for parent
            node = node.parent

    def select(node: MCTSNode) -> MCTSNode:
        """Traverse to a leaf using UCB."""
        while node.children:
            best_move = max(node.children, key=lambda m: node.children[m].ucb_score(node.visits))
            node = node.children[best_move]
        return node

    # Initial expansion
    expand_and_eval(root)

    for _ in range(num_simulations):
        leaf = select(root)
        value = expand_and_eval(leaf)
        backup(leaf, value)

    # Pick the most visited child
    best_move_uci = max(root.children, key=lambda m: root.children[m].visits)
    return best_move_uci
```

Self-play loop:

```python
# selfplay/selfplay_loop.py
import chess
from mcts import mcts_search

def self_play_game(model, num_simulations=200, device="cpu"):
    """Play one game of self-play. Returns list of (fen, result) training samples."""
    board = chess.Board()
    positions = []

    while not board.is_game_over():
        fen = board.fen()
        move_uci = mcts_search(board, model, num_simulations, device)
        board.push(chess.Move.from_uci(move_uci))
        positions.append(fen)

    result = board.result()
    final_value = 1.0 if result == "1-0" else (-1.0 if result == "0-1" else 0.0)

    # Assign value from each position's perspective
    samples = []
    for i, fen in enumerate(positions):
        # Alternate sign (alternating colors)
        value = final_value * ((-1) ** i)
        samples.append({"fen": fen, "score": value})

    return samples

# Run self-play to generate training data:
# samples = []
# for game_num in range(1000):
#     samples.extend(self_play_game(model, num_simulations=100))
#     if game_num % 100 == 0:
#         # Retrain model on accumulated samples, then continue
#         pass
```

---

## 6. Integrating Any Model into Gambit

### 6a. Your Current Architecture

```
Browser (analysis/page.tsx)
    │  POST /api/analysis/engine  {fen, depth}
    ▼
Node server (server/server.js)
    │  POST /api/analysis/engine → proxies to Python engine
    ▼
Python FastAPI (chess-engine/main.py)
    │  Uses Stockfish pool
    ▼
Stockfish binary
```

Your Node server's current proxy (in `server/server.js`):

```js
app.post('/api/analysis/engine', async (req, res) => {
    const { fen, depth = 18 } = req.body;
    const engineRes = await fetch(`${process.env.GAMBIT_ENGINE_URL}/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth })
    });
    const data = await engineRes.json();
    // Normalize to {best_move, score (in pawns), pv}
    const score = data.evaluation?.type === 'cp'
        ? data.evaluation.value / 100
        : (data.evaluation?.value > 0 ? 100 : -100);
    res.json({ best_move: data.best_move, score, pv: data.lines?.[0]?.move || '' });
});
```

### 6b. Adding Your Custom PyTorch Model to `chess-engine/`

After training, put your `chess_model.pt` in `chess-engine/` and create:

```python
# chess-engine/neural_engine.py
import os
import torch
import sys
sys.path.append(os.path.dirname(__file__))

from chess_value_net import ChessNet, fen_to_tensor
import chess

MODEL_PATH = os.environ.get("NEURAL_MODEL_PATH", "./chess_model.pt")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_model: ChessNet | None = None

def _load_model():
    global _model
    if _model is not None:
        return _model
    try:
        checkpoint = torch.load(MODEL_PATH, map_location=DEVICE)
        config = checkpoint.get("config", {"num_res_blocks": 10, "channels": 256})
        _model = ChessNet(**config).to(DEVICE)
        _model.load_state_dict(checkpoint["model_state"])
        _model.eval()
        print(f"Neural model loaded from {MODEL_PATH} on {DEVICE}")
    except Exception as e:
        print(f"Could not load neural model: {e}")
        _model = None
    return _model


def neural_analyze(fen: str, top_n: int = 3) -> dict:
    """
    Analyze a position using the custom neural network.
    Returns {"best_move": str, "score": float (pawns), "pv": str}
    """
    model = _load_model()
    if not model:
        return {"best_move": None, "score": 0.0, "pv": "", "engine": "neural_unavailable"}

    board = chess.Board(fen)
    if board.is_game_over():
        return {"best_move": None, "score": 0.0, "pv": ""}

    # Evaluate each legal move
    best_move = None
    best_score = float("-inf")
    move_scores = []

    for move in board.legal_moves:
        child = board.copy()
        child.push(move)
        child_tensor = fen_to_tensor(child.fen()).unsqueeze(0).to(DEVICE)
        with torch.no_grad():
            val = model(child_tensor).item()
        # Negate because it's the opponent's value
        score_for_us = -val
        move_scores.append((move.uci(), score_for_us))
        if score_for_us > best_score:
            best_score = score_for_us
            best_move = move.uci()

    move_scores.sort(key=lambda x: x[1], reverse=True)
    # Convert from [-1,+1] to pawns (rough)
    score_pawns = round(best_score * 10, 2)

    return {
        "best_move": best_move,
        "score": score_pawns,
        "pv": " ".join(m for m, _ in move_scores[:5]),
        "engine": "neural",
        "top_moves": [{"move": m, "score": round(s * 10, 2)} for m, s in move_scores[:top_n]]
    }
```

Add the endpoint to `main.py`:

```python
from neural_engine import neural_analyze

@app.post("/analyze/neural")
def analyze_neural(req: AnalyzeReq):
    result = neural_analyze(req.fen)
    if not result["best_move"]:
        raise HTTPException(status_code=503, detail="Neural engine unavailable")
    return result
```

### 6c. Multi-Engine API Design

Update Node `server/server.js` to route to the right engine:

```js
app.post('/api/analysis/engine', async (req, res) => {
    const { fen, depth = 18, engine = 'stockfish' } = req.body;
    const engineUrl = process.env.GAMBIT_ENGINE_URL || 'http://localhost:8000';

    const endpointMap = {
        stockfish: '/analyze',
        leela:     '/analyze/leela',
        neural:    '/analyze/neural',
    };

    const endpoint = endpointMap[engine] ?? '/analyze';

    try {
        const r = await fetch(`${engineUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, depth, nodes: 800 }),
        });
        const data = await r.json();

        // Normalize all engines to same response shape
        let score = 0;
        if (engine === 'stockfish') {
            score = data.evaluation?.type === 'cp' ? data.evaluation.value / 100 : (data.evaluation?.value > 0 ? 100 : -100);
        } else {
            score = data.score ?? 0;
        }

        res.json({
            best_move: data.best_move,
            score,
            pv: data.pv ?? data.lines?.[0]?.move ?? '',
            engine: data.engine ?? engine,
        });
    } catch (err) {
        res.status(503).json({ error: `Engine error: ${err.message}` });
    }
});
```

### 6d. Frontend Engine Selector

In `frontend/app/analysis/page.tsx`, add an engine picker next to the Stockfish toggle:

```tsx
const [engineMode, setEngineMode] = useState<'stockfish' | 'leela' | 'neural'>('stockfish');

// In the fetch:
const res = await fetch(
    `${process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'}/api/analysis/engine`,
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: game.fen(), depth: 18, engine: engineMode })
    }
);

// Engine selector UI (add in right panel header):
<select
    value={engineMode}
    onChange={e => setEngineMode(e.target.value as any)}
    className="text-xs rounded px-2 py-1"
    style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)', color: 'var(--text-secondary)' }}>
    <option value="stockfish">Stockfish 16</option>
    <option value="leela">Leela (Neural)</option>
    <option value="neural">Custom Net</option>
</select>
```

### 6e. Move Classification Using Your Neural Model

Once you have a trained model, you can augment move classification without Stockfish:

```python
# In chess-engine/neural_engine.py — add this function

def neural_classify_move(fen: str, move_uci: str) -> dict:
    """
    Classify a move without Stockfish.
    Returns classification + score delta.
    """
    model = _load_model()
    if not model:
        return {"classification": "Unknown", "cp_loss": 0}

    board = chess.Board(fen)

    # Eval before move
    tensor_before = fen_to_tensor(fen).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        val_before = model(tensor_before).item()

    # Get best available move (greedy)
    best_val = float("-inf")
    for move in board.legal_moves:
        child = board.copy()
        child.push(move)
        t = fen_to_tensor(child.fen()).unsqueeze(0).to(DEVICE)
        with torch.no_grad():
            v = -model(t).item()
        if v > best_val:
            best_val = v

    # Eval after played move
    played_board = board.copy()
    played_board.push(chess.Move.from_uci(move_uci))
    tensor_after = fen_to_tensor(played_board.fen()).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        val_after = -model(tensor_after).item()

    # Delta in [-1, +1] space, convert to cp-equivalent
    delta = best_val - val_after  # positive = worse than best
    cp_loss_equiv = max(0, delta * 1000)  # rough centipawn equivalent

    if delta < -0.03:          classification = "Brilliant"
    elif cp_loss_equiv < 10:   classification = "Best"
    elif cp_loss_equiv < 25:   classification = "Excellent"
    elif cp_loss_equiv < 50:   classification = "Good"
    elif cp_loss_equiv < 100:  classification = "Inaccuracy"
    elif cp_loss_equiv < 200:  classification = "Mistake"
    else:                      classification = "Blunder"

    return {"classification": classification, "cp_loss": round(cp_loss_equiv, 1)}
```

---

## 7. Accuracy Formula

Your current formula in `engine.py` (line 149):

```python
def compute_game_accuracy(cp_losses):
    if not cp_losses:
        return 100.0
    avg_loss = sum(cp_losses) / len(cp_losses)
    raw_accuracy = 103.1668 * math.exp(-0.04354 * avg_loss) - 3.1669
    return round(max(0.0, min(100.0, raw_accuracy)), 1)
```

This is the **chess.com accuracy formula** (reverse-engineered). It maps average centipawn loss to a percentage:

| Avg CP Loss | Accuracy % |
|-------------|------------|
| 0           | ~100%      |
| 20          | ~95%       |
| 50          | ~85%       |
| 100         | ~68%       |
| 200         | ~35%       |
| 300         | ~15%       |

Alternative: Lichess uses a simpler formula:

```python
def lichess_accuracy(cp_losses):
    """Lichess ACPL (Average Centipawn Loss) — lower is better."""
    if not cp_losses:
        return 0.0
    return round(sum(cp_losses) / len(cp_losses), 1)
```

If you integrate your neural model, replace `cp_loss` (centipawns) with `delta * 1000` from the neural evaluations and plug into the same formula.

---

## 8. Advanced: Hybrid Engine (Stockfish + Neural Net Together)

The most powerful approach: use Stockfish as a fast first-pass, then use the neural net to re-rank candidates.

```python
# chess-engine/hybrid_engine.py

def hybrid_analyze(fen: str, sf_depth: int = 14) -> dict:
    """
    1. Get top 5 candidate moves from Stockfish (fast)
    2. Re-rank them using neural net evaluation
    3. Return the neural-preferred move with Stockfish's eval as fallback
    """
    # Step 1: Stockfish candidates
    with get_engine(sf_depth) as sf:
        if not sf:
            return neural_analyze(fen)  # fallback to pure neural
        sf.set_fen_position(fen)
        top_moves = sf.get_top_moves(5)
        sf_eval = sf.get_evaluation()

    # Step 2: Neural re-ranking
    model = _load_model()
    if not model:
        # Neural unavailable — return pure Stockfish
        return {
            "best_move": top_moves[0]["Move"] if top_moves else None,
            "score": (sf_eval["value"] / 100) if sf_eval["type"] == "cp" else 0,
            "engine": "stockfish_fallback"
        }

    board = chess.Board(fen)
    ranked = []
    for candidate in top_moves:
        move_uci = candidate["Move"]
        child = board.copy()
        child.push(chess.Move.from_uci(move_uci))
        t = fen_to_tensor(child.fen()).unsqueeze(0).to(DEVICE)
        with torch.no_grad():
            neural_val = -model(t).item()  # negate for our perspective
        ranked.append((move_uci, neural_val, candidate.get("Centipawn", 0)))

    ranked.sort(key=lambda x: x[1], reverse=True)
    best_move, best_neural_val, sf_cp = ranked[0]

    return {
        "best_move": best_move,
        "score": sf_cp / 100.0,  # use stockfish cp for accuracy (it's more calibrated)
        "neural_score": round(best_neural_val * 10, 2),
        "engine": "hybrid"
    }
```

---

## 9. Deployment Notes (Free Tiers)

### Render (chess engine — free tier)

```yaml
# chess-engine/render.yaml
services:
  - type: web
    name: gambit-engine
    runtime: python
    buildCommand: |
      apt-get update && apt-get install -y stockfish wget unzip &&
      wget -q "https://github.com/LeelaChessZero/lc0/releases/download/v0.30.0/lc0-v0.30.0-linux-cpu-openblas.zip" -O lc0.zip &&
      unzip lc0.zip -d /usr/local/bin/ && chmod +x /usr/local/bin/lc0 &&
      pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: STOCKFISH_PATH
        value: /usr/bin/stockfish
      - key: LEELA_PATH
        value: /usr/local/bin/lc0
      - key: LEELA_WEIGHTS
        value: ./leela_weights.pb.gz
      - key: STOCKFISH_POOL_SIZE
        value: "2"
      - key: LEELA_POOL_SIZE
        value: "1"
      - key: NEURAL_MODEL_PATH
        value: ./chess_model.pt   # put this in your repo after training
```

**Free tier limits:**
- 512 MB RAM → use `num_res_blocks=6, channels=128` for your neural model (smaller)
- Spins down after 15 min idle → add a health-check ping from frontend every 10 min

**Keep-alive ping (add to frontend `_app.tsx` or layout):**

```tsx
useEffect(() => {
    const pingEngine = () => fetch('/api/health/engine').catch(() => {});
    const id = setInterval(pingEngine, 8 * 60 * 1000); // every 8 min
    return () => clearInterval(id);
}, []);
```

### Model file size limits

| Config | Parameters | File size | RAM needed |
|--------|-----------|-----------|------------|
| 6 blocks, 128ch | ~3M | ~12 MB | ~50 MB |
| 10 blocks, 256ch | ~22M | ~88 MB | ~350 MB |
| 20 blocks, 256ch | ~44M | ~175 MB | ~700 MB |

Render free tier: use **6 blocks, 128ch**.

---

## 10. Quick Reference — Commands Cheat Sheet

```bash
# ── Setup ─────────────────────────────────────────────────────────────────

# Install chess.js Python library
pip install chess stockfish torch torchvision zstandard

# Download Lichess data (January 2024)
wget https://database.lichess.org/standard/lichess_db_standard_rated_2024-01.pgn.zst

# Decompress
python3 -c "
import zstandard as zstd
with open('lichess_db_standard_rated_2024-01.pgn.zst','rb') as f:
    with open('lichess.pgn','wb') as o:
        zstd.ZstdDecompressor().copy_stream(f, o)
"

# Generate 100k Stockfish-labeled positions
python3 generate_training_data.py  # creates training_data.jsonl

# ── Training ──────────────────────────────────────────────────────────────

# Local (CPU, slow)
python3 train/train_value_net.py

# Colab (GPU, fast — paste code into Colab notebook)
# Runtime → T4 GPU → Run

# ── Testing your model ────────────────────────────────────────────────────

python3 -c "
import torch, sys
sys.path.append('model')
from chess_value_net import ChessNet
ckpt = torch.load('chess_model.pt', map_location='cpu')
m = ChessNet(**ckpt['config'])
m.load_state_dict(ckpt['model_state'])
m.eval()
score = m.evaluate_to_centipawns('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
print('1.e4 position score:', score, 'cp')
"

# ── Run engine locally ────────────────────────────────────────────────────

cd chess-engine
uvicorn main:app --reload --port 8000

# Test Stockfish
curl -X POST http://localhost:8000/analyze \
  -H 'Content-Type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","depth":15}'

# Test Leela (after setup)
curl -X POST http://localhost:8000/analyze/leela \
  -H 'Content-Type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","nodes":400}'

# Test neural
curl -X POST http://localhost:8000/analyze/neural \
  -H 'Content-Type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","depth":0}'

# ── Leela download ────────────────────────────────────────────────────────

# Get latest BT4 weights (CPU-optimized):
# 1. Go to https://lczero.org/play/networks/bestnets/
# 2. Download the BT4-1740 network (labeled "recommended for CPU")
# 3. Place as chess-engine/leela_weights.pb.gz

# ── Free GPU resources ────────────────────────────────────────────────────

# Google Colab:   https://colab.research.google.com (T4 GPU, ~12hr sessions)
# Kaggle:         https://kaggle.com/kernels (P100, 30hr/week)
# Lightning.ai:   https://lightning.ai (free tier, L4 GPU)
# Hugging Face Spaces: free CPU inference hosting for your trained model

# ── Lichess game databases ────────────────────────────────────────────────

# All months: https://database.lichess.org/
# Elite games only (ELO 2400+): https://database.lichess.org/#elite_games
# Puzzles: https://database.lichess.org/#puzzles
```

---

## Summary — Decision Tree

```
Do you want to improve analysis quality right now, no training?
  └─ YES → Increase Stockfish depth (20-22) for post-game, keep 12 for live.
           Nothing else needed.

Do you want a neural network engine, no training?
  └─ YES → Install Leela Chess Zero + download BT4 weights (free, ~200MB).
           Follow Section 4. ELO comparable to Stockfish. Different style.

Do you want to train your own model?
  └─ YES → Follow Section 5.
  └─ How much compute do you want to spend?
      └─ Minimal (1-2 hrs Colab) → 6 res blocks, 128ch, 50k positions from Stockfish.
                                    ELO ~1000-1400. Good enough for beginner analysis.
      └─ Medium  (10 hrs Colab)  → 10 res blocks, 256ch, 500k positions.
                                    ELO ~1600-1800.
      └─ Serious (weeks)         → Self-play with MCTS, start from random weights.
                                    AlphaZero style. ELO potential: 2200+.

Do you want the best of both worlds?
  └─ YES → Hybrid: Stockfish for candidate generation, neural for re-ranking.
           Follow Section 8.
```

The fastest path to a working neural analysis feature: **Tier 2 (Leela)**, done in one afternoon.
The most educational path: **Tier 3 with Stockfish-labeled data**, trained on Colab.
The most powerful path (Stockfish still wins for pure accuracy): **Hybrid**.
