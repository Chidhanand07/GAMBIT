# Server characterization tests (PR 02)

These tests record what the game server does **today**, including known bugs,
so the layered rewrite (domain / repositories / services / http / sockets) can
show that nothing observable changed. They are the oracle: if one fails after
a refactor, the refactor changed behaviour. Don't edit the test to make it pass.

## Run

```bash
cd server
npx jest __tests__/characterization   # this suite only
npx jest                               # whole server suite
```

`lobby.test.js` and `timers.test.js` wait for the real 1000 ms matchmaking and
global-clock ticks, so each of those files takes about 10–15 s. The other files
finish in about 2 s.

## Seams used (the only ones allowed)

- `require('../../server')` gives `{ app, server, io, matchmaking }`. The server
  listens on port 0 inside the test process.
- `jest.mock` of `../../supabase`, `../../lib/redis` and `../../services/rating`,
  using `../helpers/mockSupabase.js` and `../helpers/mockRedis.js`.
- `../../lib/gameStore` to seed or read Redis game state.
- A `global.fetch` spy (`ctx.fetch`) stands in for the chess engine.
- `socket.io-client` and `supertest`.

Do not import anything else from `server/` (`src/**` internals, private maps).
Those modules will move during the refactor.

## Files

| File | Area |
| --- | --- |
| `session.test.js` | `authenticate`, reconnect during a game |
| `lobby.test.js` | `join_queue` / `leave_queue`, `queue_status`, pairing → `match_found` |
| `game.test.js` | `join_game` (Redis, DB restore, completed), `spectate_game`, `make_move` |
| `chat.test.js` | `send_message` → `chat_message` and the `messages` insert |
| `game-end.test.js` | client `game_end`: DB update, review trigger, rating |
| `timers.test.js` | disconnect bookkeeping, `clock_sync`, abandonment, flag fall |
| `social.test.js` | rematch and challenge events |
| `http.test.js` | live HTTP endpoints, Express CORS and Socket.IO CORS |
| `harness.js` | shared setup: `useServer()`, `once`, `record`, `waitFor` … |

## Adding a case

1. Pick the file for the area. Each file starts with the three `jest.mock`
   calls and `const ctx = useServer();`.
2. Arrange the state with literal values. For example:
   `ctx.seatedGame({ whiteClockMs: 60000 })` seats both players in a fresh game.
   `supabase.queue('games', { data, error })` sets what the next DB call returns.
   `ctx.fetch.mockImplementation(...)` sets the engine's answer.
3. Start listening before you trigger anything: call `once(socket, event)` or
   `record(socket, event)` first, then `emit`.
4. Assert exact payloads with `toEqual`. Use `ISO_DATE`, `expect.any(Number)`
   and similar matchers only for timestamps and ids. To pin clock values
   exactly, use `jest.spyOn(Date, 'now').mockReturnValue(T)`; `waitFor` does
   not depend on `Date.now`, so it keeps working.
5. To pin a bug, name the test `... (BUG pinned)` and assert the current
   wrong output.
6. Never put real credentials in fixtures. Use obviously fake values such
   as `fake-test-token`.
