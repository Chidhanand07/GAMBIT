# ADR 0200 — Divergent time-control → speed-bucket mappings are not unified

- **Status:** accepted (PR 10)

## Context

PR 10 moves pure chess helpers into `frontend/lib/chess/`. Mapping a time
control ("10", "5+3", …) to bullet/blitz/rapid/classical is implemented in
several places with **different** rules:

| Where | Parse | Thresholds | Missing / NaN | "0" |
|---|---|---|---|---|
| `app/profile/[username]/page.tsx` `classifyTimeControl` | `parseInt` | ≤2 / ≤5 / ≤15 | rapid | bullet |
| `app/api/profile/[username]/stats/route.ts` `classifyTc` | `parseInt(tc) \|\| 10` | ≤2 / ≤5 / ≤15 | rapid | rapid |
| `app/join/[token]/page.tsx` `tcLabel` | `parseInt` | ≤2 / ≤5 / ≤15 | **classical** | bullet |
| `app/game/[id]/page.tsx` `PlayerStrip.getFormatRating` | base before "+", default 10 | **<3 / <10 / ≥30** | rapid | bullet |
| `server` `rating._ratingField`, `join_queue` | `parseInt(tc) \|\| 10` | ≤2 / ≤5 / **≤60** | rapid | rapid |

So a 7-minute game is "rapid" on the profile, "blitz" in the game page's
player strip, and rated in the server's rapid pool; a 30-minute game is
"classical" in the UI but rated in the server's rapid pool.

## Options

1. One `classifyTimeControl` used everywhere (changes what users see).
2. Extract the shared threshold step (`speedBucketForMinutes`, ≤2/≤5/≤15)
   and the two parsing front-ends that exist today, and compose them at each
   call site so every site keeps its exact semantics; leave the sites with
   different thresholds in place.

## Decision

Option 2. `lib/chess/timeControl.ts` exports `parseBaseMinutes`
(`parseInt(tc) || 10`), `speedBucketForMinutes` (NaN → classical, matching
`tcLabel`), `classifyTimeControl` (the profile variant) and
`SPEED_BUCKET_LABELS`. The profile page, stats route and join page now
compose these; each is equivalent to its old code for all inputs (unit tests
pin the edge cases: "", NaN, "0", negatives, "5+3"). The game page's
`getFormatRating` and the server's rating field keep their own thresholds.

## Why

The refactor must not change behaviour (PLAYBOOK hard constraint 1), and the
mismatch is user-visible. Unifying the thresholds is a product decision for
the fix phase (listed as a bug in the PR 10 body). SOLID-03 asks for time
controls to be a strategy behind a small interface; that is deferred until
the rules agree, since a strategy that encodes three contradictory rule sets
would only hide the problem.
