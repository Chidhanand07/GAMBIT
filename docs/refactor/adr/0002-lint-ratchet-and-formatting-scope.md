# ADR 0002 — Lint ratchet, formatting scope and logging rule

- **Status:** accepted (PR 01)

## Context

The rulebook (SIZE-01..05, SOLID-12, NODE-06) asks for strict lint limits,
but 5 server files and 38 frontend files already violate them. The refactor
must not change behaviour, and PRs should stay reviewable (GIT-05).

## Decisions

1. **Ratchet baseline per package.** `server/.lint-baseline.json` and
   `frontend/.lint-baseline.json` list legacy files with their line counts.
   ESLint downgrades every rule to `warn` for those files only
   (`scripts/lint-baseline/eslint-baseline.js`); every other file gets errors.
   `scripts/lint-baseline/ratchet.js` fails CI when a listed file grows, a
   stale entry remains, or (on PRs) the list gains a file that the base
   branch's list did not have. Per-package files avoid conflicts between the
   parallel server/frontend branches (ADR 0001).
2. **Prettier only on refactored paths** (`server/src/**`, `frontend/features`,
   `types`, `lib/{chess,server,api}`). Reformatting all legacy JS/TS now would
   produce thousands of changed lines in files that later PRs split anyway,
   which would bury the real moves in blame and diffs. The Python engine is small, so it was
   formatted in full in a separate formatting-only commit.
3. **`no-console` stays off.** NODE-20 asks for pino structured logging, but
   log output is observable behaviour and this refactor preserves behaviour.
   Recorded as a deviation for the fix phase.
4. **Ruff legacy ignores** are per-file in `chess-engine/ruff.toml`; import
   sorting (I001) was *not* auto-applied because reordering imports can
   change import side effects.
5. **Type errors fixed without runtime change:** a cast in
   `app/api/friends/route.ts` (Supabase types a many-to-one embed as an
   array) and `downlevelIteration` in `tsconfig.json` (type-check only; Next
   compiles with SWC). No `@ts-expect-error` was needed.

## Why

The ratchet blocks new debt from day one without a big-bang rewrite, which
is the enforcement model the rulebook prescribes ("a ratchet, not a rewrite").
