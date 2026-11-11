# ADR 0101 — Server config: call-time accessors, dotenv stays put, raw engine responses

- **Status:** accepted (PR 04)

## Context

PR 04 makes `server/src/config/env.js` the only reader of `process.env`
(NODE-05) and moves the engine `fetch` calls, the Supabase client and the
Redis client behind `server/src/clients/` (SOLID-06). NODE-05 asks for a
config object that is read once, validated and frozen. But the legacy code
reads its settings at different moments, and some of those moments are
observable:

- `ENGINE_URL` is read on every engine call, and `FRONTEND_URL` on every CORS
  check. The characterization tests set and delete both per test, after the
  server module has loaded.
- `SUPABASE_*` and `REDIS_URL` are read when `supabase.js` / `lib/redis.js`
  load, after `require('dotenv').config()` has run in `server.js` (line 5) or
  `supabase.js` (line 1).
- `PORT` is read only when the process is started directly.

## Options

1. A frozen snapshot read when `env.js` loads, with validation and fail-fast.
2. A frozen object of accessors (`env.engineUrl()`, ...) that read
   `process.env` when called.
3. A snapshot for the start-up values plus getters for the per-request ones.

## Decision

Option 2. Also:

1. **No validation, no fail-fast.** Missing Supabase settings still only log
   the same `FATAL` lines and boot with placeholder values. Failing fast would
   change behaviour, so it is deferred.
2. **`dotenv` stays where it was.** `server.js` and `supabase.js` keep their
   `require('dotenv').config()` calls. `env.js` does not load `.env` itself,
   because that would change *when* `.env` is applied. For example, requiring
   `lib/redis.js` on its own would then start honouring a `.env` `REDIS_URL`.
3. **Names and defaults are unchanged.** That includes the `ENGINE_URL` vs
   `.env.example`'s `GAMBIT_ENGINE_URL` mismatch, which is a known bug and is
   preserved.
4. **`engineClient` returns the raw `fetch` promise.** It is not an `async`
   wrapper. Callers keep their own `.ok` / `.json()` / `.catch` handling, and
   a synchronous throw from `fetch` still surfaces in the same place. The
   fire-and-forget review trigger stays non-awaited. The client resolves the
   base URL and the global `fetch` per call, so `jest.spyOn(global, 'fetch')`
   keeps working. Request-shaping defaults (`depth || 18`,
   `String(timeControl ?? '10')`) stay at the call sites.
5. **The client factories own the start-up logging.** `supabase.js` and
   `lib/redis.js` become thin legacy seams that call the factories with
   values from `env`. They keep their exports, so the tests' `jest.mock` of
   these paths still replaces the clients everywhere.

## Why

Behaviour preservation outranks NODE-05's "read once" (PLAYBOOK decision
priority). Accessors give one place that knows every name and default. Each
read still happens at the same moment as before, which a single snapshot
could not do without breaking the per-test `ENGINE_URL`/`FRONTEND_URL`
characterization tests. Once the canonical env names (NODE-05) are agreed as
a behaviour change of their own, the accessors can be turned into a
validated snapshot in one file.
