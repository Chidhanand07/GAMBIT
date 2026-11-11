# ADR 0222 — Lobby component boundaries: accepted React reconciliation differences

- **Status:** accepted (PR 14, lobby)

## Context

`app/lobby/page.tsx` (572 lines, one 489-line component) is split into
`features/lobby/components/*` and `features/lobby/hooks/*`. Splitting JSX into
components keeps the serialized DOM identical, with two internal differences
that are invisible to users:

1. The searching panel and the action-button grid were both `<div>`s in one
   ternary, so React reused the grid `<div>` (and the third button, "Friend",
   as "Cancel search") when the search started. As separate components
   (`SearchPanel`, `PlayActions`) they now mount fresh nodes. The only
   measurable effect is the order of declarations in the Cancel button's
   serialized `style` attribute (`color; border-color` vs `border-color; color`).
2. Text such as `{customMin} min`, `{customMin}+{customInc}` and the `mm:ss`
   search timer is now a single text node instead of 2–3 adjacent ones
   (identical `textContent` / `innerHTML`). The timer uses `lib/chess/clock.fmtTime`,
   identical for the non-negative `searchTime`.

Also, the Play Online `onClick` was an `async` arrow with no `await`; it is now
a plain function (same synchronous effects).

## Options

1. Keep the ternary branches inline in the page to preserve node reuse.
2. Accept the differences and verify equivalence.

## Decision

Option 2. Equivalence was checked with a throw-away test rendering the old and
new page side by side through the same scenarios (presets, custom modal +
sliders, Play Online, reconnect, cancel, private modal config/share/copy/close/
game_start, active-game warning, signed-out, hover handlers, 125 s of timer):
`innerHTML` (style declarations normalised), every `socket.emit` and every
`router.push` were identical.

## Why

Readability and SIZE-01/02/03 compliance (page < 150 lines, every function
≤ 100 lines and complexity ≤ 10) at the cost of a difference no user or test can
observe.
