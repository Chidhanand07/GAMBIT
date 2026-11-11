# ADR 0260 — Delete unused `lib/supabase/server.ts`

- **Status:** accepted (PR 10)

## Context
`frontend/lib/supabase/server.ts` exported a `createClient()` cookie-bound
server client. It was on the lint baseline (empty `catch {}`), and no PR owned it.
After PR 08 moved every route handler onto `lib/server/supabase.ts`, nothing
imports it.

## Evidence
`git grep -n "supabase/server"` across the whole repository (frontend, server,
tests, scripts, docs) returns only its own `.lint-baseline.json` entry. No test
mocks the path.

## Decision
Delete the file as proven-dead code (allowed exception to the no-behaviour-change
rule), and drop its baseline entry.

## Why
A lint-only fix to dead code adds noise. The live server-side Supabase factories
are in `lib/server/supabase.ts` (NX-05).
