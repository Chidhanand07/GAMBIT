# ADR 0213 — The game board uses the shared `components/ui/Piece.tsx`

- **Status:** accepted (PR 09/13, fe-game)

## Context

The game page defined its own `Piece({ color: Color; type })`. FRONTEND_TRACK asks that the
duplicate be removed only if the rendering is identical.

## Options

1. Delete the local copy and import the shared component.
2. Add a variant prop to the shared component.
3. Keep both and document the difference.

## Decision

Option 1. A comparison of the two shows identical output: same `src` (`/pieces/classic/${color}${type.toLowerCase()}.png`),
`alt` (`${color}${type}`), `draggable={false}`, `className`
(`select-none pointer-events-none w-[82%] h-[82%] object-contain`) and inline
`filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5))`. The prop types also match: chess.js `Color`
is `'w' | 'b'`, the same as the shared `PieceColor`. `components/ui/Piece.tsx` is **not
modified**, so its other users (analysis, offline) render exactly as before. The promotion
picker's 36 px images use different classes and alt text and are not pieces on the board,
so they stay inline in `PromotionModal`.

## Why

There was no rendering difference to support, so a variant prop would have been an unused
abstraction (SOLID-09). The existing `__tests__/components/Piece.test.tsx` and the
characterization board queries (`getAllByAltText(/^[wb]k$/)`) cover the shared component.
