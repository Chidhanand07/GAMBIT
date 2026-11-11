# ADR 0001 — One file per ADR; rulebook source

- **Status:** accepted (PR 00)

## Context

The refactor is delivered as a stack of ~19 PRs, and the server, frontend and
engine work proceeds on parallel branches that are later stacked. A single
`DECISIONS.md` that every PR appends to would conflict on every rebase.
The engineering rulebook was provided as `Claude outputs/NextJS NodeJS and
SOLID rules.md` (untracked in the working copy).

## Options

1. Single append-only `DECISIONS.md`.
2. One Markdown file per ADR under `docs/refactor/adr/`, numbered by area, with
   `DECISIONS.md` as an index.

## Decision

Option 2. Number ranges per area avoid collisions. The rulebook is committed
verbatim as `docs/ENGINEERING_RULES.md`.

## Why

Parallel branches never edit the same file, so stacking them is conflict-free;
the index is rebuilt once at the end of the stack.
