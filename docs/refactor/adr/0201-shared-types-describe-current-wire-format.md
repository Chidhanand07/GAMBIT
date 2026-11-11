# ADR 0201 — `frontend/types/` describes the current wire format, quirks included

- **Status:** accepted (PR 10)

## Context

PR 10 adds shared domain and socket payload types so later PRs (12–16) can
replace `any` in the pages and hooks. The protocol has known inconsistencies:
the client sends chat as `text` while the server persists `message`; the
client's `make_move` has no `move` (UCI) field, so the server never asks the
engine to validate; rematch payloads carry ids from optional chains
(possibly undefined); `game_end` is partly built by the client and echoed.

## Options

1. Model the intended protocol (required `move`, `message`, non-null ids).
2. Model what is actually sent and received today, marking unused or
   never-sent fields optional with a comment, and mark columns that no
   migration creates (`peak_*`) as optional.
3. Generate types from Supabase (`supabase gen types`).

## Decision

Option 2. Files: `types/{timeControl,profile,game,friendship,notification,socket}.ts`,
types only (no runtime code). `ClientToServerEvents` / `ServerToClientEvents`
follow socket.io-client's generic shape, but `SocketProvider` is **not** yet
typed with them: that would turn every legacy handler signature into a type
change across five pages at once; the hooks extracted in PRs 12–16 adopt them.

## Why

Types that claim fields which are never sent would let new code rely on them
and break silently, which defeats the purpose of typing. Option 3 needs
database access and a new dev tool, and still would not cover socket payloads
or PostgREST embeds. TEST-08 asks for shared message schemas between the apps;
these types are the frontend half, and a zod schema can be derived from them
when validation is added (a behaviour change, so not in this refactor).
