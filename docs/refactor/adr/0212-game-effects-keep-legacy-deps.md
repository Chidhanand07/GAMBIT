# ADR 0212 — Game hooks keep the legacy effect dependencies (documented eslint-disables)

- **Status:** accepted (PR 09/13, fe-game)

## Context

`react-hooks/exhaustive-deps` is an error for new code. Five legacy effects rely on
incomplete dependency arrays, and the characterization tests pin those behaviours:

| Hook / effect | Legacy deps | Read from the closure | Why it matters |
| --- | --- | --- | --- |
| `useMoveHistory` restore | `[]` | `lsKey`, `chessRef`, `dispatch` | Restores once on mount only. |
| `useGameData` fetch | `[gameId]` | `myProfile`, `soundOn`, `router` (stale) | Exactly one fetch per id; the start sound and seat use the values from mount. |
| `useGameData` seat | `[myProfile?.id, gameData]` | `myProfile` | A profile refetch with the same id must not re-run it (it would reset `flipped`). |
| `useGameSocket` | `[socket, myProfile, gameId, myColor, soundOn]` | `router`, `dispatch`, refs | Adding `router` would re-subscribe on every render, because test routers are new objects each render. The `myColor`/`soundOn` re-runs (double join) are LEGACY and pinned. |
| `useOpponentDisconnect` countdown | `[opponentDisconnected]` | `disconnectCountdown` | One interval per disconnect (ADR 0211). |

## Options

1. Satisfy the rule by adding deps. That changes when effects re-run and breaks pinned behaviour.
2. Mirror the closure values into "latest" refs. That changes the stale-closure semantics, so
   the values read would be the latest, not those of the render that started the effect.
3. Keep the exact deps, with `// eslint-disable-next-line react-hooks/exhaustive-deps -- <reason>`
   on each of these five effects only.

## Decision

Option 3, which is the exception FRONTEND_TRACK allows. Every other new effect satisfies the
rule. Where the rule only needed stable values (`dispatch`, refs passed as arguments, the
`useCallback([])` disconnect callbacks), they were added to the deps, because stable deps
never trigger a re-run. `isMyTurn`, `commitMove` and `handleSquareClick` were `useCallback`s
whose identity was never observable (their deps were all the values they captured, and the
JSX re-binds them every render). They are now plain per-render functions.

## Why

Behaviour preservation comes first in the decision order. Each disable is next to its
effect, states its reason, and is listed in the PR body.
