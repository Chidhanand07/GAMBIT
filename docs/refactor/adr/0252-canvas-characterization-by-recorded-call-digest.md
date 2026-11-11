# ADR 0252 — Canvas animations are characterized by a digest of recorded 2D-context calls

- **Status:** accepted (fe-misc, PR 16 track)

## Context

`components/ui/KnightIntro.tsx` (527 lines) and `components/ui/KnightBackground.tsx` had no
tests and needed to be split (SIZE-01/02/04). jsdom has no canvas implementation, so there is no
pixel output to compare, and RTL queries only see the wrapper markup.

## Options

1. Install `canvas`/`jest-canvas-mock` (new native or dev dependency; `package.json` is owned by
   another PR).
2. Only assert wrapper markup and `onComplete` timing (would not catch a changed draw order,
   wrong easing or a dropped trail step).
3. In the test, stub `HTMLCanvasElement.prototype.getContext` with a Proxy that records every
   method call and property write (numbers rounded to 1e-4), drive `Math.random`,
   `performance.now` and `requestAnimationFrame` deterministically, and snapshot a sha256 digest
   of the log plus its length for a fixed frame schedule (5 background frames per mode, the full
   0–18 s intro timeline at 250 ms steps, both silhouette samplers).

## Decision

Option 3 (`__tests__/characterization/KnightCanvas.test.tsx`, snapshots committed with the test
before the refactor). The split into `features/knight/*` kept every digest unchanged, i.e. the
same calls with the same arguments in the same order.

## Why

It pins exact canvas behaviour with no new dependency. The trade-off is opacity: a digest
mismatch says *that* drawing changed, not *what*; a future intentional visual change must
regenerate the snapshot (`npx jest -u` on that file) and say so in its PR.
