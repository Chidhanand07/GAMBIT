# ADR 0232 — Profile fetch helpers return the raw (typed) Response

- **Status:** accepted (PR 15, profile page split)

## Context

`frontend/lib/api/profile.ts` wraps the ten `/api/*` calls the profile page
makes. The call sites handle responses in different ways: `r.ok ? r.json() : fallback`
in `.then` chains, `await res.json()` after an `ok` check, fire-and-forget
PUTs whose status is ignored, and one chain with no `.catch`. The
characterization tests use `act()` flush loops, so they are sensitive to
how many microtask hops a chain takes.

## Options

1. Helpers parse and return data (`Promise<Profile | null>`), with fallbacks inside.
2. Helpers return `fetch(...)` unchanged, typed as `TypedResponse<T>`
   (`Response` with `json(): Promise<T>`). Callers keep their own `ok`/fallback logic.

## Decision

Option 2. Each helper is a single `return fetch(url, options)`, with no `async`
and no extra `.then`. The options object is a fresh literal per call, as
before. The games-tab helper keeps the un-encoded username (LEGACY, pinned).

## Why

Option 1 would merge four different error policies into one, or need a helper
per policy, and it would add promise hops. Option 2 keeps the URL, method,
headers and body in one typed place, which is what SOLID-06/SOLID-10 ask for
client fetches, and the hooks still read like the original code. A
data-returning layer can come later together with real error handling (a
behaviour change).
