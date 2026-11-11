# ADR 0242 — Analysis hooks: engine effect keyed on the FEN string; import inputs stay at page level

- **Status:** accepted (PR 10/13, fe-shell)

## Context

The legacy analysis page:
- ran the engine effect with deps `[game?.fen(), engineEnabled]`. `exhaustive-deps` rejects this
  expression dep, and the body read `game` from the closure;
- kept `customFen` / `customPgn` / `fenCopied` in the page, so their values survived switching between
  the Analysis and Import tabs, which unmount each other;
- had the arrow-key handler call `setGame` and other setters from inside the
  `setCurrentMoveIndex` updater function.

## Options

1. Move the engine effect into a hook that takes `game` and uses `[game, engineEnabled]`. This re-runs
   when a new `Chess` object has the same FEN (navigating to the current move, reset at the start).
   That is an extra 500 ms debounce and an extra POST.
2. The hook takes the FEN string (`game?.fen()`, `undefined` before mount) and uses `[fen, engineEnabled]`.
3. Move the import inputs into `ImportPanel`'s own state.

## Decision

Option 2 for the engine. `useEngineAnalysis(fen)` tests `fen === undefined` where the old code tested
`!game`. `game` objects are never mutated in this page (every change makes a new `Chess`), so the FEN
read when the timer fires is the same as before. Option 3 is rejected: `useImportForm` is called by the
page, so the text in the inputs still survives tab switches, as before. `fenCopied` also stays in the page.
The arrow-key handler (`useArrowKeyNavigation`) keeps its side effects inside the updater. This is legacy
behaviour; it would double-run under StrictMode in dev only.

## Why

When effects run, the fetches they make and the state that survives remounts are all observable
behaviour. Option 2 is exact and lint-clean without a suppression.
