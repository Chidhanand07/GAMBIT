# ADR 0210 — Game page split into `features/game` (reducer, hooks, components)

- **Status:** accepted (PR 09/13, fe-game)

## Context

`app/game/[id]/page.tsx` was 1,102 lines: 28 `useState`, 8 refs, 10 effects, ~450 lines of JSX
and four local components. The PR-02 characterization suite (69 tests) pins its socket
payloads, its 13 listeners, the double `authenticate`/`join_game` caused by effect deps, its
timers, localStorage use and keyboard navigation.

## Options

1. Split only the JSX into components and keep the state in the page.
2. One `useGame` hook that owns every piece of state, used by a thin page.
3. A typed reducer for the page state, plus one focused hook per concern (data load,
   socket, clock, history, board, disconnect). A controller hook calls them in the legacy
   effect order. Presentational components receive minimal props.

## Decision

Option 3. Layout:

- `state/gameReducer.ts`: `GameState`, `GameAction` (28 actions), `createInitialGameState`.
  It uses a handler map, so each action is a small pure function. A field that an action does
  not touch keeps its reference, so effects keyed on `fenSnapshots`/`moveList`/`lastMove`/
  `gameOver`/`gameData` re-run exactly when they did with `useState`. Where the legacy code
  made several `setX` calls and a throw could occur between them (`move_made` with a bad
  FEN, a partial `rating_updated`, `game_state_sync`), the handler dispatches the same split
  steps in the same order (`clockActivated` → load → `moveReceived`; `ratingChanged` ×2;
  `positionSet` → `stateSynced`).
- Hooks: `useGameController` (composition root), `useGameData`, `useGameSocket`
  (+ `gameSocketHandlers.ts`), `useGameClock`, `useMoveHistory`, `useChessBoard`,
  `useOpponentDisconnect` (ADR 0211), `useGameEffects` (auto-scroll, 400 ms modal delay).
  The target list also names `useRematch`. It was not created, because rematch is three
  emitters with no React state of their own. They live in `commands.ts` with chat and resign,
  and `gameCommands.ts` binds them to the current render (SOLID-09).
- Components: Board, Square, PlayerStrip, PromotionModal, MoveList, HistoryControls,
  ChatPanel, EnginePanel, GameOverModal (+ RematchButton), RematchPrompt, StatusBanners
  (reconnecting / history / opponent-disconnected banners; this replaces the planned
  `DisconnectBanner`, because the three banners are siblings), ActionBar, SidebarActions,
  GameSidebar, EvalBar.
- `RatingBadge` is deleted. It was defined in the legacy page and never referenced (repo-wide grep).

## Why

A reducer makes each state transition a unit-testable pure function (TEST-03) and removes
the 28 setters from the page (SOLID-01). Separate hooks keep each function under SIZE-02/03.
The controller keeps the legacy effect order, so the order of observable side effects (fetch,
emits, listener registration) does not change. Option 2 would just move the 1,100-line problem.
