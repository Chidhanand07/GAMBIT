# GAMBIT — working rules for humans and agents

GAMBIT is a monorepo: `frontend/` (Next.js 16 App Router, React 19, TypeScript), `server/`
(Express + Socket.io realtime game server, CommonJS), `chess-engine/` (FastAPI +
Stockfish), `supabase/` (Postgres schema and migrations).

## The rulebook is mandatory

`docs/ENGINEERING_RULES.md` is binding. MUST/MUST NOT rules block merge; departing
from a SHOULD rule needs a one-line justification in the PR description. Cite rule
IDs (NX-xx, NODE-xx, SEC-xx, SOLID-xx, SIZE-xx, TEST-xx, GIT-xx) in commits, PR
descriptions and review comments.

## Workflow

- `main` and `preprod` are protected. Never push to them; work on a short-lived
  branch (`feat/`, `fix/`, `chore/`, `refactor/`) and open a pull request.
- Conventional Commits for commit messages and PR titles.
- Run every suite before opening a PR, and keep them green:
  - `cd server && npx jest`
  - `cd frontend && npx jest && npx tsc --noEmit`
  - `cd chess-engine && python -m pytest -q`
- Never delete or weaken a test to make a change pass.
- Record non-trivial design decisions as an ADR in `docs/refactor/adr/` and list
  it in `docs/refactor/DECISIONS.md`.

## Non-negotiables

- **No client-trusted identity.** Never take a user id, rating or game result
  from a request body or socket payload as the truth; derive identity from a
  verified token and state from the server (NODE-10, NODE-11, NODE-16, NX-07).
- **Database changes only via `supabase migration new`.** Never edit an applied
  migration and never change the remote database by hand (SEC-08).
- Secrets never go in source, logs or `NEXT_PUBLIC_` variables (NX-06, SEC-01).

## Metrics

`node scripts/metrics/metrics.js "<title>"` prints file/function size and
complexity per package (needs `frontend/node_modules` for the TypeScript parser).
