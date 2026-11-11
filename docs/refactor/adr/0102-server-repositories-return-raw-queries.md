# ADR 0102 — Server repositories return the raw Supabase query; legacy modules build their own instances

- **Status:** accepted (PR 05)

## Context

PR 05 moves every Supabase table query in `server.js` and `services/*.js`
behind factories in `server/src/repositories/` (SOLID-06). It also moves the
Redis game-state logic from `lib/gameStore.js` into
`src/repositories/gameStateRepository.js`. Some things about these calls are
observable, and the refactor must keep them:

- Some writes are awaited. Others are fire-and-forget: the move persist runs
  in an un-awaited `Promise.all`, the chat persist and the disconnect clock
  snapshot are chained with `.then`.
- A Supabase query builder is lazy. It only executes when something calls
  `.then` on it. The test mock (`__tests__/helpers/mockSupabase.js`) behaves
  the same way.
- The tests replace `../supabase` and `../lib/redis` with `jest.mock`, and the
  characterization suite seeds Redis through `lib/gameStore`. That module must
  share its lock map with the server.

## Options

1. Repository functions are `async` and return `await query`.
2. Repository functions are plain functions that return the query chain
   (builder or terminal promise) as is, without awaiting it.
3. One `createRepositories(supabase)` aggregate built in one place and shared.
4. Each legacy module builds the repositories it needs from
   `require('../supabase').supabase`.

## Decision

Options 2 and 4.

1. **Return the query, do not await it.** Every caller gets back the same
   thenable it built before. `await`, `Promise.all([...])` and
   `.then(() => {})` therefore behave exactly as before, and nothing runs
   earlier or later than it did. The repositories add no error handling,
   defaults or mapping. Callers still destructure `{ data, error }`
   themselves (SOLID-01: no business logic in the data layer).
2. **Same query chains, character for character.** The table, select list,
   filter order and terminal call (`.single()` / `.maybeSingle()` /
   `.select()`) are unchanged. The multi-line invite select keeps its exact
   whitespace. `__tests__/repositories/supabaseRepositories.test.js` pins
   every chain. Callers still build the row and update payloads
   (`created_at`, defaults of 1200), so those values are computed at the same
   points as before. The only reordering is that the payload object is now
   evaluated just before `supabase.from()` instead of just after it. That
   difference cannot be observed (`from()` is synchronous and side-effect
   free in both the real client and the mock).
3. **The legacy modules build their own instances.** `server.js`,
   `services/clock.js`, `friends.js`, `matchmaking.js` and `rating.js` each
   call the factories they need on the `supabase` they already import from
   the legacy path. The repositories are stateless, so several instances are
   equivalent to one, and `jest.mock('../supabase')` still reaches every
   query. The composition root (`src/index.js`, PR 09) will build them once.
   An aggregate factory now would have only one user (SOLID-09).
4. **`lib/gameStore.js` is the singleton.** It is built once over
   `require('./redis')` and still has the same seven named exports. They are
   closures, so destructured imports still work. The per-game lock map lives
   inside the factory instance, so every importer shares one lock map, as
   before. The tests and log prefixes still use `[gameStore]`.
5. **`supabase.auth.getUser` stays in `server.js`.** It is an auth call, not a
   table query. It moves into `http/middleware/requireUser.js` in PR 08.

## Why

Behaviour preservation comes first (PLAYBOOK). Returning the raw query is
the only option that keeps both the timing and the result objects identical
at every call site, awaited or not. Building instances per legacy module
keeps the existing `jest.mock` seams working without new wiring that PR 09
replaces anyway.
