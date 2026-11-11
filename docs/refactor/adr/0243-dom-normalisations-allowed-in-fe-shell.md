# ADR 0243 — Markup differences accepted in the fe-shell split (none user-visible)

- **Status:** accepted (PR 10/13, fe-shell)

## Context

Moving JSX into components and running Prettier on the new files produced three kinds of difference
from the legacy markup:

1. `app/offline/page.tsx` built each square's `className` from a template literal that had a line break
   and 20 spaces in it. The new `ComputerSquare` uses one space. The class tokens (`classList`) are
   identical.
2. Prettier wrapped some long text lines as `{' '}` + text, for example the result page's
   " · best was …" caption. React emits adjacent text nodes, so `textContent` and the serialized HTML
   are unchanged.
3. The result page renders the "analysing" screen when `status` is `'ready'` but `game` is `null`. That
   state cannot happen (`setGame` always comes before `setStatus('ready')`). The condition exists only so
   TypeScript can narrow `game` without a non-null assertion.

## Options

1. Reproduce the exact legacy strings, including the stray whitespace, and disable Prettier on those lines.
2. Accept these differences: none changes classes, text, roles, styles, structure or behaviour.

## Decision

Option 2. The characterization tests query by class, role and text, and pass unchanged.

## Why

Byte-identical whitespace inside a class attribute has no observable effect. Copying it would add
noise and Prettier exceptions without protecting any behaviour.
