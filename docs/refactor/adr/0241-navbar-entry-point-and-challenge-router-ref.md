# ADR 0241 — Navbar keeps its entry path; the challenge hook reads the router through a ref

- **Status:** accepted (PR 10/13, fe-shell)

## Context

`app/layout.tsx` imports `@/components/Navbar` (default export). The Navbar implementation moves to
`features/navigation/`. The legacy challenge-banner effect used `router.push` but listed only
`[socket, profile]` as deps, so it subscribed `challenge_request` / `challenge_declined` / `challenge_ready`
again only when the socket or profile object changed. With `react-hooks/exhaustive-deps` as an error,
new code that adds `router` to the deps would subscribe again whenever the router identity changed.
That changes the on/off call pattern; the characterization test's router mock returns a new object
on every render.

## Options

1. Point `app/layout.tsx` at the new path. Add `router` to the effect deps.
2. Keep `components/Navbar.tsx` as a one-line re-export of the feature component. In
   `useChallengeBanner`, read the router through a ref that a deps-less effect updates. The subscription
   effect then keeps exactly `[socket, profile]`.
3. Same as 2, but use `eslint-disable-next-line react-hooks/exhaustive-deps`.

## Decision

Option 2. `components/Navbar.tsx` is `export { default } from '@/features/navigation/components/Navbar'`
(the feature file has `'use client'`; the layout and its import are unchanged). The challenge
effect re-runs only when `socket` or `profile` changes, as before.

## Why

This keeps the single importer untouched and preserves when the effect runs (FRONTEND_TRACK: "use
refs/useCallback as the original effectively did"), with no lint suppression. One difference: on
`challenge_ready` the hook pushes with the router from the latest render, where the old code used
the router captured when the effect last ran. The App Router instance is stable, so the push
behaves the same.
