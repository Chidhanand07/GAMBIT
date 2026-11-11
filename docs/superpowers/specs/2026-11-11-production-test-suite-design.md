# Production test suite — design

Date: 2026-11-11

## Why

GAMBIT has not had a production incident yet. The goal is to keep it that way:
if a change breaks an important behaviour, a test should fail before the change
is merged. Today most of the code that matters has no tests, the server suite
has 4 stale failures, and nothing runs the tests automatically.

## Goals

1. Every important server behaviour is covered: moves, turn enforcement, clocks,
   timeouts, disconnects, game end, ratings, matchmaking, private games, and the
   HTTP API.
2. Every frontend API route is covered for auth, input validation and the shape
   of what it returns.
3. The chess engine's HTTP API and the MAVERICK bot are covered, including
   "always returns a legal move".
4. All three suites run offline, with no Supabase, Redis, Stockfish or network.
5. CI runs all three suites on every push and pull request.

## Non-goals

- Browser end-to-end tests, load tests, and a coverage percentage target.
- Fixing product bugs found along the way. They are listed in the PR and, where
  useful, recorded as `test.todo` entries so they are not forgotten.

## Anti-goals

- Tests that copy a function into the test file and test the copy (the two
  existing frontend tests do this). Tests must import the real code.
- Tests that depend on timing luck. Clock tests use fake timers.

## Decisions (builder's calls)

- **Fakes, not real services.** A small chainable fake of the Supabase client
  and an in-memory fake of Redis live in `server/__tests__/helpers/`. The
  frontend has an equivalent in `frontend/__tests__/helpers/`.
- **One production change in `server/server.js`:** only call `server.listen`
  when the file is run directly, and export `app`, `server`, `io` and
  `matchmaking`. Without this the file cannot be imported by a test. Behaviour
  when started with `node server.js` is unchanged.
- **Socket tests use a real Socket.IO server** on a random local port with
  `socket.io-client` (new dev dependency), so the real handlers are exercised.
- **Frontend route tests run in Jest's node environment** (per-file docblock)
  and call the exported route handlers directly.
- **Engine tests mock Stockfish and the style model** so they run without the
  binary; `requirements-dev.txt` adds `pytest`.
- **The stale server tests are corrected to match the code**: 30 minutes is
  "rapid" on the server (classical starts above 60), and the friends test's
  hand-rolled mock is replaced by the shared fake.

## Layout

```
server/__tests__/helpers/{mockSupabase,mockRedis}.js
server/__tests__/{rating,friends,gameStore,clock,matchmaking,http,sockets}.test.js
frontend/__tests__/helpers/…
frontend/__tests__/api/*.test.ts
frontend/__tests__/middleware.test.ts
frontend/__tests__/components/*.test.tsx
chess-engine/tests/{test_engine,test_api,test_computer_engine,test_model}.py
.github/workflows/tests.yml
```

## Done when

- `npm test` in `server/` and `frontend/`, and `pytest` in `chess-engine/`, all
  pass locally with no network.
- The workflow file runs the same three commands.
- The README explains how to run the tests.
