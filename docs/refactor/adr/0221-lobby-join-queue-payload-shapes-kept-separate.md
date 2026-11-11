# ADR 0221 — The two lobby `join_queue` payload shapes are kept separate

- **Status:** accepted (PR 14, lobby)

## Context

The lobby emits `join_queue` from two places with different shapes, both pinned
by `LobbyPage.characterization.test.tsx`:

| Source | `user` | `time_control` (custom 12+5) | `increment` | `is_rated` |
|---|---|---|---|---|
| Play Online button | the full profile object | `"12+5"` | 5 | omitted |
| socket `connect` while searching (re-queue) | `{ id }` | `"12"` | 5 | `true` |

The page also contained dead variants: `handlePlayOnline` (a third shape, never
referenced), `handleCancelSearch` and `copyInvite` (duplicates of the inline
handlers that are actually wired), the unused `socketUrl` and `searchRadius`
locals, and unused imports (`useRef`, `createClient`, six lucide icons).

## Options

1. One `buildJoinQueuePayload()` used by both paths (changes the wire payload).
2. Keep both shapes: `playOnlineTimeControl()` (pure, in
   `features/lobby/timeControls.ts`) feeds the button; `useMatchmaking`'s
   `connect` handler keeps the `{ id }` / minutes-only / `is_rated: true` form.

## Decision

Option 2, with comments at both sites pointing at the difference. The dead
handlers/locals/imports are deleted: a repo-wide grep
(`grep -rn -E "searchRadius|handlePlayOnline|handleCancelSearch|copyInvite" frontend server`)
found them only in their own declarations in `app/lobby/page.tsx`; `socketUrl`
elsewhere is unrelated locals in `join/[token]` and `signup`.

## Why

ZERO behaviour change; unifying the payloads is a protocol fix that belongs in
its own PR together with the server's `is_rated` default.
