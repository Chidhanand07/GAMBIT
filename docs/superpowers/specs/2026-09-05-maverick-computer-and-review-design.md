# MAVERICK Computer Mode, Board Pieces & chess.com-style Game Review

Date: 2026-09-05
Status: Approved (defaults: analysis depth 18, full review walkthrough)

## Context

GAMBIT's "Computer" button routes to `/offline`, a local board with **no opponent**
(user moves both sides) and pieces drawn as Unicode glyphs (hard to read). The trained
"plays like me" style bot (`chess-engine /style-move`) is deployed but wired to nothing.
Game review is half-built: `chess-engine /analyse-game` (depth-18 Stockfish, per-move
classification + accuracy + critical moments → Supabase) exists but is **never called**,
and the result page is 100% mock data.

This spec covers three features.

---

## Feature 1 — MAVERICK (computer opponent)

**Identity:** MAVERICK = the style bot. Difficulty changes how much Stockfish supervises it,
so strength genuinely rises across levels while keeping the "plays like me" personality.

**Architecture:** client-side game (browser chess.js) + Next.js API proxy → chess-engine.
No sockets/DB (bot games are not persisted or rated).

**New engine endpoint** `POST /computer-move {fen, difficulty}` → `{uci, san, difficulty}`:
- **Easy**: sample from the style model's probability distribution with high temperature
  (more randomness) → human-like, will make mistakes. No Stockfish correction.
- **Medium**: style model's top move, but a shallow Stockfish check **vetoes blunders**
  (cp loss > ~300) → falls back to the model's best non-blunder candidate.
- **Hard**: take the model's top-K candidates, **Stockfish re-ranks** them, play the
  strongest → never blunders, still style-flavored.
- Fallback: if the model returns nothing (out-of-distribution), play a legal Stockfish/
  random move so MAVERICK never stalls.

**Next.js proxy** `POST /api/maverick-move` → forwards to `${ENGINE_URL}/computer-move`
(keeps engine URL server-side, solves CORS).

**Computer screen** (evolve `/offline` or new `/computer`): choose **color**
(White / Black / Random) + **difficulty** (Easy / Medium / Hard). After each human move,
browser calls the proxy, applies MAVERICK's returned move to the local game (~400ms
"thinking" delay + last-move highlight so the piece visibly moves). Controls: New Game,
Resign, Undo (takeback). Branded "MAVERICK".

**Testing:** drive `/computer-move` directly (engine + Stockfish, `gambit-bot` env),
play **each difficulty ≥2×**, show Easy drops material / Hard avoids blunders.

---

## Feature 2 — Board pieces

Replace Unicode glyphs on the computer/offline board with the existing PNG set
(`/pieces/classic/{color}{type}.png`) via a shared `<Piece>` component (same source the
online board uses at `app/game/[id]/page.tsx:12-14`). Reuse across boards to avoid
duplication.

**Testing:** run the dev server, load the computer board, screenshot — white vs black
pieces clearly distinguishable, matching the online board.

---

## Feature 3 — Game review (ONLINE games only)

Bot-game review is deferred (client-side bot games have no Supabase record). This wires
the existing pipeline for online games and makes it chess.com-realistic.

**chess.com logic to match:**
1. Evaluate each position with Stockfish (depth 18).
2. Convert eval → **win %** via sigmoid; measure the win% *drop* per move (not raw cp).
3. Classify: Book, Best, Excellent, Good, Inaccuracy, Mistake, Miss, Blunder,
   Brilliant (good move that sacrifices material, still best/not losing), Great (only move).
4. **Accuracy %** per side = blend of per-move accuracies from win% drops
   (`103.1668·e^(−0.04354·x) − 3.1669`, x = win% drop).
5. Estimated rating from accuracy; eval/advantage graph; move-by-move walkthrough.

**Backend changes (`chess-engine`):**
- Trigger `/analyse-game` from `server/server.js` when an online game ends.
- Fix accuracy: feed the formula **win% drops** (correct chess.com method), not average cp.
- Add **Book** (opening detection) and **Miss** classifications (already in UI color map).
- Ensure per-move eval is stored for the eval graph.

**Frontend changes:**
- Replace the mock result page (`app/game/[id]/result/page.tsx`) with real fetched data.
- Build chess.com-style walkthrough: board replay, per-move classification icons,
  best-move arrow on mistakes, eval graph, per-side accuracy + counts, estimated rating.

**Testing:** analyze a real finished game, verify accuracy/classifications are sane
(a known blunder is flagged Blunder), eval graph renders, walkthrough navigates.

---

## Constraints
- Additive: don't break existing engine endpoints or the online game flow.
- Don't touch `CHESS BOT/`. Don't retrain the model.
- MAVERICK games are not rated/persisted (v1).

## Out of scope
- Bot-game review (deferred — needs a synchronous, DB-free analyze path).
- Bot ratings / matchmaking / persistence.
