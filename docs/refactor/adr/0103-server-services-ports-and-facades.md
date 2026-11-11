# ADR 0103 — Server services: emitter and client ports, deps-context functions, legacy facades

- **Status:** accepted (PR 05/13, services)

## Context

PR 05/13 moves the business logic out of the `server.js` socket handlers and
out of `services/*.js` into factories in `server/src/services/` (SOLID-01,
SOLID-06, NODE-03). Four things constrain the shape:

- **NODE-03:** services must not receive `io`, `socket`, `req` or `res`. But
  the handlers interleave room joins, direct emits, room broadcasts and
  `await`s, and the order of those steps is observable.
- **The test seams (PLAYBOOK):** `services/rating.js`, `clock.js`,
  `matchmaking.js` and `friends.js` keep their module paths and public APIs.
  Tests `jest.mock` the rating module with only `processGameEnd`, call
  `finalizeExpiredGame(io, gameId, game, winnerId, reason)` with five
  arguments, and construct `new MatchmakingService(io)`.
- **Time and randomness:** tests use fake timers, `jest.spyOn(Date, 'now')` and
  `jest.spyOn(Math, 'random')` after the modules have loaded.
- **Size limits:** SIZE-02 caps functions at 60 lines. A factory that defines
  every method as a closure counts all of their lines.

## Options

1. Pass `io` and `socket` into the services.
2. Have services return "emit intents" for the handler to send after the call.
3. Inject two small ports: an **Emitter** (`toRoom(room, event, ...args)`,
   `toAll(event, ...args)`) for broadcasts, and a **ClientPort**
   (`{ id, join(room), emit(event, ...args) }`) for the connection that sent
   the event.

For the factory shape:

- A. Closures inside the factory.
- B. Module-level functions that take a deps context as their first argument,
  with a factory that only binds the context.

## Decision

**Option 3 and option B.**

- `src/services/emitter.js` defines both ports and `createIoEmitter(io)`. Each
  port call is exactly one `io.to(room).emit(...)` or `io.emit(...)`, made at
  the same point as before. Arguments are forwarded with rest parameters, so a
  payload-less event (`rematch_declined`) stays payload-less on the wire. An
  explicit `undefined` argument would reach the client as `null`.
- Handlers build the ClientPort from the socket (`clientOf(socket)` in
  `server.js`), so services never see the socket.
- Services read session state (`sessions.userIdOf(socket.id)`) at the same
  point as the old handler. `make_move` reads it after `await getGame`, so the
  lookup happens inside the service. Handlers never read it up front.
- `now` and `random` are injected. Their defaults are `() => Date.now()` and
  `() => Math.random()`, which resolve the global when they are called, so
  tests that spy on `Date.now` or `Math.random` still work. `new Date().toISOString()`
  stays inline, because a `Date.now` spy does not affect `new Date()`. Using
  `new Date(now())` would change which clock the timestamp comes from.
- `src/sockets/sessionRegistry.js` (userSockets, socketUsers, userActiveGame)
  arrives in this PR, not in PR 06/13, because `gameService` and `chatService`
  depend on its port.
- **Legacy facades.** `services/rating.js` and `services/friends.js` export the
  factory's object as the singleton. `services/clock.js` keeps the
  module-level interval handle and builds a `clockService` per `io`.
  `services/matchmaking.js` stays a class that owns the 1 s interval and
  shares `queue` with the service (`this.queue === this.service.queue`). The
  facades keep their legacy signatures. Five-argument signatures that tests
  pin (`finalizeExpiredGame`, `joinQueue`, `processGameEnd`) carry an
  `eslint-disable-next-line max-params` with that reason.
- `privateGameService` (invite games) is split from `socialService`
  (rematch, challenge, notifications). The `friends.js` singleton has no
  `io`, and `socialService` needs an emitter.

## Why

- **Behaviour preservation.** Every Redis and Supabase call, every `await`, every
  fire-and-forget chain (move persist, chat persist, disconnect snapshot,
  review trigger), every log string, room name and emission order is
  unchanged. Every existing suite passes untouched, including all of
  `characterization/*`. The synchronous prefix of each handler (room join,
  session updates) still runs before the first `await`. The only timing
  difference is a few extra microtask hops where a service function awaits a
  helper. No I/O or emission moves relative to another.
- **NODE-03 and testability.** The services are unit-tested with plain fakes in
  `__tests__/services/`, with no `jest.mock` (SOLID-07).
- **SIZE-02/03.** With option B each function stays small and reviewable, and
  the factories stay short. Option 2 would have added a new layer of
  indirection and shifted socket emits by microtasks.
