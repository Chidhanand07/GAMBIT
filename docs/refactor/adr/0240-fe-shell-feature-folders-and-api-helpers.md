# ADR 0240 — fe-shell pages split into feature folders, characterization tests first

- **Status:** accepted (PR 10/13, fe-shell)

## Context

Four legacy client files had no tests and were far over the size limits:
`app/analysis/page.tsx` (473 lines), `components/Navbar.tsx` (350),
`app/offline/page.tsx` (370) and `app/game/[id]/result/page.tsx` (287). All four
were in the lint baseline and used `any`.

## Options

1. Split each file in place into local helper components (no new folders).
2. Add characterization tests first. Then move logic into
   `features/{analysis,navigation,offline,game-result}/` (hooks, pure helpers,
   components) and the fetch calls into `lib/api/<feature>.ts`, so each page is
   a thin composition.

## Decision

Option 2.

- Characterization tests (`__tests__/characterization/{AnalysisPage,Navbar,OfflinePage,GameResultPage}.test.tsx`)
  were committed **before** any refactor and pass unchanged after it. They pin the fetch URLs, options and
  bodies, the socket events and payloads, the timers and the rendered states.
- One `lib/api` helper per route the pages call: `analysis.ts` (`requestEngineAnalysis`),
  `offline.ts` (`requestMaverickMove`), `notifications.ts` (`getNotifications`, `markNotificationsRead`),
  `gameResult.ts` (`fetchGameForReview`). Each calls the global `fetch` at call time with the same
  arguments as before. A helper keeps the old quirks: the engine-analysis response status is not checked,
  and the maverick error message falls back from `detail` to `error` to `Engine error (<status>)`.
- Wire types that only these helpers describe live next to them (`EngineAnalysis`, `MaverickMoveResponse`)
  so that `lib/` does not import from `features/`.
- Pure logic (`features/*/board.ts`, `game.ts`, `squareClick.ts`, `review.ts`) is unit-tested in
  `__tests__/features/<feature>/`.
- The analysis page's local `renderPiece` produced the same markup as `components/ui/Piece`
  (same `src`, `alt`, `draggable`, class and style), so it now uses `Piece`.

## Why

Behaviour preservation comes first, so tests had to exist before the move. Feature folders follow the
FRONTEND_TRACK target structure (SOLID-01/02). The `lib/api` helpers give one place per route for the
request shape (SOLID-06 seam), and tests can still fake `global.fetch`.
