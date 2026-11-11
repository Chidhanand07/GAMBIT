# ADR 0211 — Opponent-disconnect countdown stays in `useState`, outside the reducer

- **Status:** accepted (PR 09/13, fe-game)

## Context

The legacy countdown effect starts one `setInterval` per disconnect. Its deps are
`[opponentDisconnected]`, deliberately without the count. Each tick runs
`setDisconnectCountdown(prev => { if (prev <= 1) { clearInterval(id); return 0 } return prev - 1 })`:
the interval stops itself from inside the state updater, which uses the real current count.
That count includes a reset from a second `opponent_disconnected` that arrives while the
first one is still showing.

## Options

1. Move it into the reducer and clear the interval from a ref after dispatching. The ref
   holds the last *rendered* count, which can be stale within one `act`/batch, so the
   interval would stop at a different tick.
2. Move it into the reducer and run `clearInterval` inside the reducer, which makes the
   reducer impure.
3. Keep `opponentDisconnected` + `disconnectCountdown` as two `useState`s in a small hook
   (`useOpponentDisconnect`) with the legacy effect and updater unchanged. The hook exposes
   stable `markDisconnected` / `markReconnected` callbacks for the socket handlers.

## Decision

Option 3. Every other piece of page state is in the reducer.

## Why

It keeps the exact timer lifecycle, including self-clearing at 0 and no restart on a re-sent
disconnect. `__tests__/features/game/useOpponentDisconnect.test.ts` pins this with
`jest.getTimerCount()`. The callbacks are `useCallback([])`, so the socket effect can use them
without changing when it re-runs.
