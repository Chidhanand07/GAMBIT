# ADR 0220 — Lobby private-game state lives in a page-level hook, not in the modal

- **Status:** accepted (PR 14, lobby)

## Context

The "Play a Friend" modal is rendered only while `isPrivateModalOpen` is true,
but all of its state (step, time control, colour, rated flag, invite link,
game id, "copied" flag) was declared in `LobbyPage`. That makes some legacy
behaviour depend on where the state lives:

- the chosen options and the generated invite survive closing and reopening;
- closing via backdrop / X resets the step to `config`, but a `game_start`
  event only closes the modal, so reopening afterwards shows the `share` step;
- the `join_game` emit is driven by `inviteGameId` whether or not the modal is open.

## Options

1. Move the state into `PrivateGameModal` (self-contained component) — the
   state would be lost on every close, changing all three behaviours above.
2. Extract the state, the create/copy handlers and the `join_game` effect into
   `features/lobby/hooks/usePrivateGame.ts`, called by the page; the modal is a
   presentational component that receives the hook's return value.

## Decision

Option 2. The page still owns `isPrivateModalOpen`; `closePrivateModal` does
`setIsPrivateModalOpen(false)` + `setInviteState('config')` as before, and the
`game_start` listener (in `useMatchmaking`) only closes the modal.

## Why

Behaviour preservation outranks component encapsulation (PLAYBOOK priority).
The hook is also a real test seam (SOLID-09): `__tests__/features/lobby/hooks.test.tsx`
exercises it without rendering the page.
