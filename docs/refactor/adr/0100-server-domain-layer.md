# ADR 0100 — Server domain layer: shape and exact-parity choices

- **Status:** accepted (PR 03)

## Context

PR 03 moves the duplicated pure logic of the game server (time-control parsing,
clock arithmetic, the Redis game-state object, result labels, PGN, Glicko-2 and
pairing) into `server/src/domain/` (SOLID-07, TEST-03) and calls it from every
existing call site. The refactor must not change behaviour (PLAYBOOK hard
constraint 1), including at edge cases that look like accidents. A few call
sites that "look the same" differ in small ways, and some legacy seams
(`this.getSearchRadius`, `this.calculateNewRatings`) could in principle be
overridden from outside.

## Options

1. One generic helper per concept (e.g. a single `clocksAt` for all four clock
   sites; `findPairs(queue, now)` computing every pair up front), accepting tiny
   differences at edge cases.
2. Domain functions that reproduce each call site's exact semantics, with the
   per-site differences kept as separate functions or parameters.

## Decision

Option 2. Specifically:

1. **Ticker clock vs. other clock sites.** `make_move`, `join_game` and
   `disconnect` share `clocksAt`/`clocksAfterMove` ("`'w'` charges White, any
   other side charges Black; nothing charged before the first move"). The
   global ticker keeps its own `tickerSnapshot`, because the original ticker
   only replaces Black's displayed clock when `activeSide === 'b'` exactly, and
   assumes `lastMoveAt` is set. `join_game`'s extra "frozen while disconnected"
   rule stays at the call site.
2. **Pairing keeps the original clock reads.** `findOpponent(player,
   candidates, clock)` takes a clock *function* and reads it exactly where the
   old loop called `Date.now()` (once for the player, once per candidate with
   the same time control). The outer loop, with its `await createGame(...)`
   between pairings, stays in `MatchmakingService.matchPlayers`, so later
   iterations still see the later time. A `findPairs(queue, now)` that pairs
   everything up front would sample time before the awaits and could shift a
   search-radius boundary. `matchPlayers` now calls the domain
   `getSearchRadius` directly rather than `this.getSearchRadius`; the method
   still exists (delegating) and nothing overrides it (repo-wide grep).
3. **`createInitialGameState` has no default for `isRated`.** The three sites
   default differently (`?? true` in matchmaking, `?? false` in friends and
   the restore path), so each caller passes its own value. Other fields default
   only on `undefined`, matching the literals they replace; key order is pinned
   by a unit test because the object is JSON-serialised into Redis.
4. **Rating facade keeps its seams.** `processGameEnd` still calls
   `this.calculateNewRatings` and `this._ratingField`, which delegate to
   `domain/rating/glicko` and `domain/timeControl`. The unused
   `this.glicko2` property set in the constructor had no reader (grep across
   `server/`, `frontend/`, `scripts/`), so it was deleted as dead code.
5. **`parseIncrement`** stays exported from `services/clock.js`, delegating to
   `parseIncrementMs`. `matchmaking.js` and `friends.js` no longer lazily
   `require('./clock')` for it; requiring that module has no side effects.

## Why

Behaviour preservation outranks a smaller API (PLAYBOOK decision priority).
Each choice is backed by a differential check run during PR 03: about 63k
generated inputs compared the old inline code with the domain functions,
including NaN/null/undefined clocks, unknown sides, odd time-control strings
and 3,000 random queues.
