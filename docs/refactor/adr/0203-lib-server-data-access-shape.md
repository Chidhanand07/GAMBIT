# ADR 0203 — Shape of `frontend/lib/server` (clients, data functions)

- **Status:** accepted (PR 11)

## Context

PR 11 moves the Supabase access of all 18 `app/api/**/route.ts` handlers (and
`app/auth/callback/route.ts`) into `frontend/lib/server/` (NX-05,
`import 'server-only'`). Constraints: identical queries (table, columns,
filters, order, limit, terminal), the same key per handler, the same order of
side effects, and the route tests mock `@supabase/supabase-js`,
`@supabase/ssr` and `next/headers` by module path.

## Options

1. A repository object per entity created once per module (cached client).
2. Plain functions that take the client as their first argument and return
   the awaited PostgREST result (`{ data, error }`) unchanged; handlers create
   the client per request through small factories.
3. Higher-level services that also build HTTP responses.

## Decision

Option 2. `supabase.ts` holds the factories: `createAdminClient()`
(service role, `autoRefreshToken/persistSession: false`, env read per call),
`createCookieReadingClient(store, { noPersistence })` (anon, read-only
cookies; `auth` options only for `/api/games/[id]`, as before),
`createLoginClient` (cookie removal sets `maxAge: 0`) and
`createOAuthCallbackClient` (removal without `maxAge`) — the two
response-cookie adapters differ, so they are not merged. Entity modules:
`profiles`, `games`, `friendships`, `notifications`, `auth`, plus
`privateGames` (invite row), `profileStats` (aggregation) and `engine`
(maverick-move proxy; `ENGINE_URL` still read at module load). Handlers keep
creating the client at the same point (after the same early returns), and a
handler that issued several queries still uses one client.
`ensureOAuthProfile` creates its own client inside the caller's `try`, as the
old `ensureProfile` did, so a client-construction failure stays non-fatal.
No `lib/api/` client helpers are added: no page changes in this PR (SOLID-09);
they arrive with the page PRs.

## Why

Returning the raw result lets each handler keep its exact status/body mapping
(some ignore `error`, some map it to 200 `[]`, 400 or 500) without a second
error vocabulary. Per-request clients match today's behaviour and keep the
jest module mocks effective. Passing the client in (SOLID-05) is the test seam;
no DI container (SOLID-08).
